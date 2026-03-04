import express, { type NextFunction, type Request, type Response } from 'express';
import { scrapeProduct, readFileData, initBrowser, createPage, writeProductCSV, initCSV, closeCSV, worker } from "./utils.js";

const app = express();
const PORT = 3000;
let browser: any;
let context: any;
const WORKER_COUNT = 3;

/* -------------------------
   Initialize Browser Once
-------------------------- */

async function init() {
    const result = await initBrowser();
    browser = result.browser;
    context = result.context;

    initCSV();

    console.log("Browser initialized");
}

init();

app.get("/scrapper", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const fileData = await readFileData("skus.json");
        const queue = [...fileData.skus];
        const workers = [];

        for (let i = 0; i < WORKER_COUNT; i++) {
            workers.push(worker(context, queue, i+1));
        }          
        
        await Promise.all(workers);
        closeCSV();

        res.status(200).send({
            message: "Scrapping in completed, check console for details",
        })
    }
    catch (error) {
        next(error)
    }

});


app.use((err: Error, req: Request, res: Response) => {
    console.error(err);
    res.status(500).send({
        error: "Internal Server Error",
        message: err.message,
        details: err.stack
    });
});

app.listen(PORT, () => {
    console.log(`App is listening on port: ${PORT}`)
})