"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSerializedGraph = exports.parseLog = exports.parserOptions = exports.readEKG = exports.writeEKG = exports.set2JSON = void 0;
const types_1 = require("../types");
const fs_1 = __importDefault(require("fs"));
const json_stream_stringify_1 = require("json-stream-stringify");
const big_json_1 = __importDefault(require("big-json"));
const fast_xml_parser_1 = __importDefault(require("fast-xml-parser"));
// Allows sets to be serialized by converting them to arrays
function set2JSON(key, value) {
    if (typeof value === "object" && value instanceof Set) {
        return [...value];
    }
    return value;
}
exports.set2JSON = set2JSON;
// Parses arrays back to sets
function JSON2Set(key, value) {
    if (typeof value === "object" && value instanceof Array) {
        return new Set(value);
    }
    return value;
}
const writeEKG = (obj, path) => {
    return new Promise((resolve, reject) => {
        const writeStream = fs_1.default.createWriteStream(path);
        const jsonStream = new json_stream_stringify_1.JsonStreamStringify(obj, set2JSON);
        jsonStream.on('end', resolve);
        jsonStream.pipe(writeStream);
    });
};
exports.writeEKG = writeEKG;
const idReplacer = (key, val) => val;
const getReplacer = (key, replacer = idReplacer) => {
    switch (key) {
        case "entityRels":
        case "correlations":
        case "entityTypes": return (key, val) => JSON2Set(key, val);
        case "derivedDFs":
        case "directlyFollows": return (key, val) => val.map((elem) => traverseJSON(elem, replacer, getReplacer));
        case "timestamp": return (key, val) => new Date(val);
        default: return replacer;
    }
};
const traverseJSON = (obj, replacer, getReplacer) => {
    if ((0, types_1.isDict)(obj)) {
        for (const key in obj) {
            obj[key] = replacer(key, obj[key]);
            obj[key] = traverseJSON(obj[key], getReplacer(key, replacer), getReplacer);
        }
        return obj;
    }
    else {
        return replacer("", obj);
    }
};
const readEKG = (path) => {
    return new Promise((resolve, reject) => {
        const readStream = fs_1.default.createReadStream(path);
        const parseStream = big_json_1.default.createParseStream();
        parseStream.on('data', function (obj) {
            const traversedObj = traverseJSON(obj, getReplacer(""), getReplacer);
            if ((0, types_1.isEKG)(traversedObj)) {
                resolve(traversedObj);
            }
            else {
                reject(new Error("Not an Event Knowledge Graph..."));
            }
        });
        readStream.pipe(parseStream);
    });
};
exports.readEKG = readEKG;
exports.parserOptions = {
    attributeNamePrefix: "",
    attrNodeName: "attr",
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: true,
    stopNodes: ["parse-me-as-string"],
};
// Parse .xes file to an EventLog
const parseLog = (filepath, classifierName = "Event Name") => {
    if (!filepath.endsWith(".xes")) {
        throw new Error("Invalid file extension");
    }
    const data = fs_1.default.readFileSync(filepath);
    const logJson = fast_xml_parser_1.default.parse(data.toString(), exports.parserOptions);
    const log = {
        events: new Set(),
        traces: {},
    };
    let keys = "";
    for (const i in logJson.log[0].classifier) {
        if (logJson.log[0].classifier[i].attr.name === classifierName) {
            keys = logJson.log[0].classifier[i].attr.keys;
        }
    }
    if (keys === "")
        keys = "concept:name";
    // Extract classifiers to array according to https://xes-standard.org/_media/xes/xesstandarddefinition-2.0.pdf
    // Example: "x y 'z w' hello" => ["hello", "x", "y", "z w"]
    const classifiers = (keys + " ") // Fix for case where
        .split("'") // Split based on ' to discern which classifiers have spaces
        .map((newKeys) => {
        // Only the classifiers surrounded by ' will have no spaces on either side, split the rest on space
        if (newKeys.startsWith(" ") || newKeys.endsWith(" ")) {
            return newKeys.split(" ");
        }
        else
            return newKeys;
    })
        .flat() // Flatten to 1d array
        .filter((key) => key !== "") // Remove empty strings
        .sort(); // Sort to ensure arbitrary but deterministic order
    let id = 0;
    for (const i in logJson.log[0].trace) {
        const trace = [];
        let traceId = "";
        const xmlTrace = logJson.log[0].trace[i];
        try {
            for (const elem of xmlTrace.string) {
                if (elem.attr.key === "concept:name") {
                    traceId = elem.attr.value;
                }
            }
        }
        catch (e) {
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
                    const event = elem.string.find((newElem) => newElem.attr.key === clas);
                    nameArr.push(event.attr.value);
                }
                catch {
                    throw new Error("Couldn't discern Events with classifiers: " + classifiers);
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
exports.parseLog = parseLog;
const writeSerializedGraph = (model, path) => {
    fs_1.default.writeFileSync(path, JSON.stringify(model, set2JSON, 4));
};
exports.writeSerializedGraph = writeSerializedGraph;
