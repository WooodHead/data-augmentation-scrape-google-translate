const fs = require("fs");

const puppeteer = require("puppeteer");
const Pick = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");
const { chain } = require("stream-chain");

const urlTo = "https://translate.google.com/#en/de/";
const urlBack = "https://translate.google.com/#de/en/";

const path = "/Users/filter/Downloads/caption_datasets/dataset_coco.json";
const resultDir = "results/";

const maxTries = 10;

let browser = null;

const processImage = img => {
  return new Promise(async (resolve, reject) => {
    try {
      const results = [];

      await Promise.all(
        img.sentences.map(async x => {
          let numTry = 0;
          while (numTry < maxTries) {
            const page = await browser.newPage();
            const text = x.raw;
            await page.goto(urlTo + text);

            const textTo = await page.evaluate(() =>
              document.querySelector("#result_box").textContent.trim()
            );

            await page.goto("about:blank"); // has to be there for some reason

            await page.goto(urlBack + textTo);

            const textBack = await page.evaluate(() =>
              document.querySelector("#result_box").textContent.trim()
            );
            if (textBack != "") {
              console.log("GOT", textBack);
              results.push(textBack);
              break;
            } else {
              numTry++;
            }
            page.close();
          }
        })
      );
      // await browser.close();
      resolve(results);
      // setTimeout(() => resolve(results), Math.random() * 5000 + 3);
    } catch (error) {
      reject(error);
    }
  });
};

function* processAll(arr) {
  for (let i = 0; i < arr.length; i++) {
    const newSentences = yield processImage(arr[i]);

    fs.writeFile(
      resultDir + arr[i].imgid + ".txt",
      newSentences.join("\n"),
      function(err) {
        if (err) {
          return console.log(err);
        }
      }
    );
  }
}

const runner = genFun => {
  const itr = genFun();

  const run = arg => {
    const result = itr.next(arg);

    if (result.done) return result.value;
    else return Promise.resolve(result.value).then(run);
  };

  return run();
};

let startWith = 0;
fs.readdirSync(resultDir).forEach(file => {
  const x = parseInt(file.replace(".txt", ""));
  if (!isNaN(x)) startWith = Math.max(startWith, x);
});

console.log("starting with index: ", startWith);

// load data
const pipeline = chain([
  fs.createReadStream(path),
  Pick.withParser({ filter: "images" }),
  streamArray()
]);

const allImages = [];

pipeline.on("data", data => {
  allImages.push({ imgid: data.value.imgid, sentences: data.value.sentences });
});

pipeline.on("end", async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--proxy-server=socks5://127.0.0.1:9150"]
  });
  runner(() => processAll(allImages.slice(startWith)));
});
