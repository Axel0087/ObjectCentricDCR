import { EventKnowledgeGraph, EventLog, isDict, isEKG, Event, Trace } from "../types";
import fs from "fs";
import { JsonStreamStringify } from 'json-stream-stringify';
import json from "big-json";

import parser from "fast-xml-parser";

// Allows sets to be serialized by converting them to arrays
export function set2JSON(key: any, value: any) {
    if (typeof value === "object" && value instanceof Set) {
        return [...value];
    }
    return value;
}
// Parses arrays back to sets
function JSON2Set(key: any, value: any) {
    if (typeof value === "object" && value instanceof Array) {
        return new Set(value);
    }
    return value;
}

export const writeEKG = (obj: Object, path: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(path);
        const jsonStream = new JsonStreamStringify(obj, set2JSON);
        jsonStream.on('end', resolve);
        jsonStream.pipe(writeStream);
    })
}
const idReplacer: Replacer = (key, val) => val
const getReplacer: GetReplacer = (key, replacer = idReplacer) => {
    switch (key) {
        case "entityRels":
        case "correlations":
        case "entityTypes": return (key: any, val: any) => JSON2Set(key, val);
        case "derivedDFs":
        case "directlyFollows": return (key: any, val: any) => val.map((elem: any) => traverseJSON(elem, replacer, getReplacer));
        case "timestamp": return (key: any, val: any) => new Date(val);
        default: return replacer;
    }
}

type Replacer = (key: any, val: any) => any;
type GetReplacer = (key: string, replacer?: Replacer) => Replacer;

const traverseJSON = (obj: any, replacer: Replacer, getReplacer: GetReplacer): any => {
    if (isDict(obj)) {
        for (const key in obj) {
            obj[key] = replacer(key, obj[key]);
            obj[key] = traverseJSON(obj[key], getReplacer(key, replacer), getReplacer);
        }
        return obj;
    } else {
        return replacer("", obj);
    }
}

export const readEKG = (path: string): Promise<EventKnowledgeGraph> => {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(path);
        const parseStream = json.createParseStream();

        parseStream.on('data', function (obj: any) {
            const traversedObj = traverseJSON(obj, getReplacer(""), getReplacer);
            if (isEKG(traversedObj)) {
                resolve(traversedObj);
            } else {
                reject(new Error("Not an Event Knowledge Graph..."));
            }
        });

        readStream.pipe(parseStream);
    });
}

export const parserOptions = {
    attributeNamePrefix: "",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: true, //"strict"
    stopNodes: ["parse-me-as-string"],
};

// Parse .xes file to an EventLog
export const parseLog = (
    filepath: string,
    classifierName: string = "Event Name",
): EventLog => {
    if (!filepath.endsWith(".xes")) {
        throw new Error("Invalid file extension");
    }
    const data = fs.readFileSync(filepath);
    const logJson = parser.parse(data.toString(), parserOptions);
    const log: EventLog = {
        events: new Set<Event>(),
        traces: {},
    };

    let keys = "";
    for (const i in logJson.log[0].classifier) {
        if (logJson.log[0].classifier[i].attr.name === classifierName) {
            keys = logJson.log[0].classifier[i].attr.keys;
        }
    }
    if (keys === "") keys = "concept:name";
    // Extract classifiers to array according to https://xes-standard.org/_media/xes/xesstandarddefinition-2.0.pdf
    // Example: "x y 'z w' hello" => ["hello", "x", "y", "z w"]
    const classifiers = (keys + " ") // Fix for case where
        .split("'") // Split based on ' to discern which classifiers have spaces
        .map((newKeys) => {
            // Only the classifiers surrounded by ' will have no spaces on either side, split the rest on space
            if (newKeys.startsWith(" ") || newKeys.endsWith(" ")) {
                return newKeys.split(" ");
            } else return newKeys;
        })
        .flat() // Flatten to 1d array
        .filter((key) => key !== "") // Remove empty strings
        .sort(); // Sort to ensure arbitrary but deterministic order

    let id = 0;
    for (const i in logJson.log[0].trace) {
        const trace: Trace = [];
        let traceId: string = "";
        const xmlTrace = logJson.log[0].trace[i];
        try {
            for (const elem of xmlTrace.string) {
                if (elem.attr.key === "concept:name") {
                    traceId = elem.attr.value;
                }
            }
        } catch (e) {
            traceId = (id++).toString();
        }
        if (traceId === "") {
            throw new Error("No trace id found!");
        }
        const events = xmlTrace.event ? xmlTrace.event : [];
        for (const elem of events) {
            let nameArr = [];
            for (const clas of classifiers) {
                try {
                    const event = elem.string.find(
                        (newElem: any) => newElem.attr.key === clas,
                    );
                    nameArr.push(event.attr.value);
                } catch {
                    throw new Error(
                        "Couldn't discern Events with classifiers: " + classifiers,
                    );
                }
            }
            const name = nameArr.join(":");
            trace.push(name);
            log.events.add(name);
        }
        log.traces[traceId] = trace;
    }
    return log;
};

export const writeSerializedGraph = <T>(model: T, path: string) => {
    fs.writeFileSync(path, JSON.stringify(model, set2JSON, 4));
};