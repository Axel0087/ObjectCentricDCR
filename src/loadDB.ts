import Datastore from "nedb";
import fs, { Mode } from "fs";
import { parse } from "csv-parse";
import { Activity, ModelEntities, OCEventLog } from "../types";

const dbInsert = (db: Datastore, doc: any) => {
    return new Promise<any>((resolve, reject) => {
        db.insert(doc, (err, document) => {
            if (err) reject(err);
            resolve(document);
        })
    })
}

export const dbFind = (db: Datastore, doc: any) => {
    return new Promise<any>((resolve, reject) => {
        db.find(doc, (err: Error | null, docs: any) => {
            if (err) reject(err);
            resolve(docs);
        })
    })
}

const readCSVLine = async (fn: string, nr: number): Promise<Array<string>> => {
    return new Promise((resolve) => fs.createReadStream(fn)
        .pipe(parse({ delimiter: ",", from_line: nr, to_line: nr }))
        .on("data", function (row) {
            resolve(row);
        }))
}

const toDict = (arr1: Array<string>, arr2: Array<any>): { [key: string]: any } => {
    const arr = arr1.map((key, i) => {
        const dict: { [key: string]: any } = {}
        dict[key] = arr2[i];
        return dict;
    });
    return Object.assign({}, ...arr);
}

const checkDBDoc = (dbDoc: any, row: any): boolean => {
    let retval = true;
    for (const key in dbDoc) {
        if (key === "$or") {
            retval = retval && (dbDoc[key] as Array<any>).reduce((acc, val) => acc || checkDBDoc(val, row), false);
        } else if (key === "$and") {
            retval = retval && (dbDoc[key] as Array<any>).reduce((acc, val) => acc && checkDBDoc(val, row), true);
        } else if (key === "$not") {
            retval = retval && !(checkDBDoc(dbDoc[key], row))
        } else {
            retval = retval && (dbDoc[key] === row[key]);
        }
    }
    return retval;
}


export const isPartOfSubprocess = (row: any, model_entities: ModelEntities) => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer) return true;
        if (model_entities[entity].subprocessInitializer !== undefined && checkDBDoc(model_entities[entity].dbDoc, row)) return true;
    }
    return false;
}

export const getEventId = (row: any, model_entities: ModelEntities): string => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer) return row[model_entities[entity].idField];
    }
    for (const entity in model_entities) {
        if (checkDBDoc(model_entities[entity].dbDoc, row)) return row[model_entities[entity].idField];
    }
    throw new Error("Mismatching row!");
}

export const generateOCLog = async (db: Nedb<any>, rowToActivity: (row: any) => { activity: Activity, attr: { id: string } }): Promise<OCEventLog<{ id: string }>> => {
    console.log("Generating log");
    const rawTraces: { [traceId: string]: Array<{ event: { activity: string, attr: { id: string } }, timestamp: Date }> } = {};
    const log: OCEventLog<{ id: string }> = {
        activities: new Set(),
        traces: {}
    };
    for (const row of await dbFind(db, {})) {
        if (!rawTraces[row.case]) {
            rawTraces[row.case] = [];
        }
        const event = rowToActivity(row)
        log.activities.add(event.activity);
        rawTraces[row.case].push({ event, timestamp: new Date(row.timestamp) });
    }
    for (const traceId in rawTraces) {
        log.traces[traceId] = rawTraces[traceId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).map(en => en.event);
    }

    return log;
}


export default async (csvPath: string, sampleIds: Array<string> = [], rowFilter?: (row: any) => boolean): Promise<Datastore<any>> => {
    const db = new Datastore();

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
        const promises: Array<Promise<any>> = [];
        // Weird fix because O_Create Offer's offer ID is on the following O_Created record 
        let OIdCallback: ((oId: string) => void) | undefined = undefined;
        fs.createReadStream(csvPath)
            .pipe(parse({ delimiter: ",", from_line: 2 }))
            .on("data", (row) => {
                const rowDict = toDict(header, row);
                if (rowFilter && rowFilter(rowDict)) return;
                if (sampleIds.length === 0 || sampleIds.includes(rowDict.case)) {
                    if (rowDict.Activity === "O_Create Offer") {
                        OIdCallback = (oId: string) => {
                            rowDict.OfferID = oId;
                            promises.push(dbInsert(db, rowDict));
                        }
                    } else {
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
}