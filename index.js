const fs = require("fs");

const puppeteer = require("puppeteer");
const Pick = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");
const { chain } = require("stream-chain");

const urlTo = "https://translate.google.com/#en/de/";
const urlBack = "https://translate.google.com/#de/en/";

const path = "/Users/filter/Downloads/caption_datasets/dataset_coco_head.json";
const resultDir = "results/";

let browser = null;

const processImage = img => {
  return new Promise(async (resolve, reject) => {
    try {
      const results = [];
      await Promise.all(
        img.sentences.map(async x => {
          const page = await browser.newPage();
          const text = x.raw;
          console.log(text);

          await page.goto(urlTo + text);

          const textTo = await page.evaluate(() =>
            document.querySelector("#result_box").textContent.trim()
          );

          await page.goto("about:blank"); // has to be there for some reason

          await page.goto(urlBack + textTo);

          const textBack = await page.evaluate(() =>
            document.querySelector("#result_box").textContent.trim()
          );

          await page.close();
          console.log(textBack);
          results.push(textBack);
        })
      );
      resolve(results);
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

// load data
const pipeline = chain([
  fs.createReadStream(path),
  Pick.withParser({ filter: "images" }),
  streamArray()
]);

const all_images = [];

pipeline.on("data", data => {
  all_images.push({ imgid: data.value.imgid, sentences: data.value.sentences });
});

pipeline.on("end", () => {
  (async () => (browser = await puppeteer.launch({ headless: true })))().then(
    () => {
      runner(() => processAll(all_images)).then(() => browser.close());
    }
  );
});
