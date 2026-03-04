import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, readFileSync, accessSync } from "node:fs";
import { createObjectCsvStringifier } from "csv-writer";
import fs from "fs";

chromium.use(stealthPlugin());

export interface SKUData {
    title: string;
    description: string;
    price: number;
    rating: string;
    reviewCount: number;
}

let stream: fs.WriteStream;
const csvStringifier = createObjectCsvStringifier({
    header: [
        { id: "title", title: "Title" },
        { id: "description", title: "Description" },
        { id: "price", title: "Price" },
        { id: "rating", title: "Rating" },
        { id: "reviewCount", title: "Review Count" }
    ]
});

const FAILED_SKUS_FILE = "./failed_skus.json";
const SKUS_FILE = "./skus.json";
const PRODUCT_DATA_FILE = "./product_data.csv";

type Platform = 'amazon' | 'walmart';

export const amazonSelectors = {
    title: '#productTitle',
    price: [
        "#corePrice_feature_div .a-offscreen",
        ".a-price .a-offscreen"
    ],
    rating: 'span.a-icon-alt',
    reviewCount: '#acrCustomerReviewText',
    description: '#feature-bullets'
};

export const walmartSelectors = {
    title: 'h1',
    price: [
        '[data-automation-id="item-price"]',
        ".price-characteristic",
    ],
    rating: '.f7.rating-number',
    reviewCount: '[data-automation-id="reviews-count"]',
    description: '.dangerous-html'
};

export async function worker(context: any, queue: any[], workerId: number) {

    const page = await createPage(context);

    while (queue.length > 0) {

        const item = queue.shift();
        console.log(item)
        const productData = await scrapeProduct(
            page,
            item.Type,
            item.SKU
        );
        console.log(productData, "product data")
        if(productData) {
            writeProductCSV(productData);
        }
    }

    await page.close();
}

export async function initBrowser() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

        viewport: { width: 1366, height: 768 },

        locale: 'en-US',

        timezoneId: 'America/New_York',

        extraHTTPHeaders: {
            'accept-language': 'en-US,en;q=0.9'
        }
    });

    return { browser, context };
}

export async function createPage(context: any) {
    const page = await context.newPage();
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });
    });
    page.setDefaultTimeout(60000);
    return page;
}

export async function openProductPage(page: any, url: string) {
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    await page.waitForLoadState('domcontentloaded');
}

export async function detectCaptcha(page: any) {
    const content = await page.content();
    if (
        content.includes("captcha") ||
        content.includes("Robot Check") ||
        content.includes("Type the characters you see")
    ) {
        console.log("CAPTCHA detected");
        throw new Error("CAPTCHA detected");
    }
}

export async function scrapeProduct(page: any, platform: Platform, sku: string, maxRetry: number = 2): Promise<any> {

    const url = platform === 'amazon' ? `https://www.amazon.com/dp/${sku}`
        : `https://www.walmart.com/ip/${sku}`;

    try {
        await openProductPage(page, url);
        await detectCaptcha(page);
        console.log(await page.title());

        const selectors = platform === "amazon" ? amazonSelectors : walmartSelectors;

        await page.waitForSelector(selectors.title);

        const data = await page.evaluate(({ sel, platform, sku }:any) => {

            const titleEl = document.querySelector(sel.title);

            let price = null;

            for (const s of sel.price) {
                const el = document.querySelector(s);
                if (el) {
                    price = el.textContent.trim();
                    break;
                }
            }

            const ratingEl = document.querySelector(sel.rating);
            const reviewEl = document.querySelector(sel.reviewCount);
            const descEl = document.querySelector(sel.description);

            return {
                platform,
                sku,
                title: titleEl ? titleEl.textContent.trim() : null,
                description: descEl ? descEl.textContent.trim() : null,
                price,
                rating: ratingEl ? ratingEl.textContent.trim() : null,
                reviewCount: reviewEl ? reviewEl.textContent.trim() : null,
            };

        }, { sel: selectors, platform, sku });

        if (data.title !== null && data.title !== undefined && data.title !== "") {
            removeFromFailedSkus(platform, sku);
        }
        return data;
    } catch (err) {
        console.log(maxRetry, "retry left");
        console.error(`Failed to scrape for platform: ${platform}, SKU: ${sku}:`, err);
        if (maxRetry > 0) {
            await new Promise(res => setTimeout(res, 2000));
            return scrapeProduct(page, platform, sku, maxRetry - 1);
        } else {
            // add the failed skus in the file and can be retried later
            addToFailedSkus(platform, sku);
            return null;
        }
    }
}

export function addToFailedSkus(platform: Platform, sku: string) {
    try {
        accessSync(FAILED_SKUS_FILE);
    } catch (err) {
        writeFileSync(FAILED_SKUS_FILE, "[]");
    }

    const failedSkus = JSON.parse(readFileSync(FAILED_SKUS_FILE, "utf-8") || "[]");
    const exists = failedSkus.some((item: any) => item.platform === platform && item.sku === sku);
    if (!exists) {
        failedSkus.push({ platform, sku });
        writeFileSync(FAILED_SKUS_FILE, JSON.stringify(failedSkus, null, 2));
    }
}

export function removeFromFailedSkus(platform: Platform, sku: string) {
    const failedSkus = JSON.parse(readFileSync(FAILED_SKUS_FILE, "utf-8") || "[]");
    const updatedSkus = failedSkus.filter((item: any) => !(item.platform === platform && item.sku === sku));
    writeFileSync(FAILED_SKUS_FILE, JSON.stringify(updatedSkus, null, 2));
}

export async function readFileData(fileName: string) {
    const data = await readFile("./" + fileName, "utf-8");
    if (!data) throw new Error("File empty");
    return JSON.parse(data);
}

export function initCSV() {
    stream = fs.createWriteStream(PRODUCT_DATA_FILE);
    stream.write(csvStringifier.getHeaderString());
}

export async function writeProductCSV(data: SKUData[]) {
    try {
        stream.write(csvStringifier.stringifyRecords([data]));
        console.log("CSV written successfully");
    } catch (err) {
        console.error(err);
    }
}

export function closeCSV() {
    stream.end();
}