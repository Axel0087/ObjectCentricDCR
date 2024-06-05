"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbFind = void 0;
const nedb_1 = __importDefault(require("nedb"));
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const dbInsert = (db, doc) => {
    return new Promise((resolve, reject) => {
        db.insert(doc, (err, document) => {
            if (err)
                reject(err);
            resolve(document);
        });
    });
};
const dbFind = (db, doc) => {
    return new Promise((resolve, reject) => {
        db.find(doc, (err, docs) => {
            if (err)
                reject(err);
            resolve(docs);
        });
    });
};
exports.dbFind = dbFind;
const readCSVLine = async (fn, nr) => {
    return new Promise((resolve) => fs_1.default.createReadStream(fn)
        .pipe((0, csv_parse_1.parse)({ delimiter: ",", from_line: nr, to_line: nr }))
        .on("data", function (row) {
        resolve(row);
    }));
};
const toDict = (arr1, arr2) => {
    const arr = arr1.map((key, i) => {
        const dict = {};
        dict[key] = arr2[i];
        return dict;
    });
    return Object.assign({}, ...arr);
};
exports.default = async (csvPath, sampleIds = [], rowFilter) => {
    const db = new nedb_1.default();
    db.ensureIndex({ fieldName: "EventOrigin" });
    db.ensureIndex({ fieldName: "case" });
    let header = await readCSVLine(csvPath, 1);
    for (let i = 0; i < header.length; i++) {
        header[i] = (() => {
            switch (header[i]) {
                case 'event': return 'Activity';
                case 'time': return 'timestamp';
                case 'org:resource': return 'resource';
                case 'lifecycle:transition': return 'lifecycle';
                default: return header[i];
            }
        })();
    }
    return new Promise((resolve) => {
        const promises = [];
        // Weird fix because O_Create Offer's offer ID is on the following O_Created record 
        let OIdCallback = undefined;
        fs_1.default.createReadStream(csvPath)
            .pipe((0, csv_parse_1.parse)({ delimiter: ",", from_line: 2 }))
            .on("data", (row) => {
            const rowDict = toDict(header, row);
            if (rowFilter && rowFilter(rowDict))
                return;
            if (sampleIds.length === 0 || sampleIds.includes(rowDict.case)) {
                if (rowDict.Activity === "O_Create Offer") {
                    OIdCallback = (oId) => {
                        rowDict.OfferID = oId;
                        promises.push(dbInsert(db, rowDict));
                    };
                }
                else {
                    promises.push(dbInsert(db, rowDict));
                }
                if (rowDict.Activity === "O_Created" && OIdCallback !== undefined) {
                    OIdCallback(rowDict.OfferID);
                    OIdCallback = undefined;
                }
            }
        }).on("end", async () => {
            await Promise.all(promises);
            resolve(db);
        });
    });
};
