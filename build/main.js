"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const init_1 = __importDefault(require("./init"));
const fsInteraction_1 = require("./src/fsInteraction");
const loadDB_1 = __importStar(require("./src/loadDB"));
const objectCentric_1 = require("./src/objectCentric");
const utility_1 = require("./src/utility");
const ekg_1 = __importDefault(require("./src/ekg"));
const ocDiscovery_1 = require("./src/ocDiscovery");
const ocAlign_1 = __importStar(require("./src/ocAlign"));
(0, init_1.default)();
const sample = false;
const align = false;
const rowFilter = (row) => {
    return (row.lifecycle === "SUSPEND" || row.lifecycle === "RESUME");
};
const sampleIds = sample ? ['Application_2045572635',
    'Application_2014483796',
    'Application_1973871032',
    'Application_1389621581',
    'Application_1564472847',
    'Application_430577010',
    'Application_889180637',
    'Application_1065734594',
    'Application_681547497',
    'Application_1020381296',
    'Application_180427873',
    'Application_2103964126',
    'Application_55972649',
    'Application_1076724533',
    'Application_1639247005',
    'Application_1465025013',
    'Application_1244956957',
    'Application_1974117177',
    'Application_797323371',
    'Application_1631297810'] : [];
const include_entities = ['Application', 'Workflow', 'Offer', 'Case_AO', 'Case_AW', 'Case_WO'];
const model_entities_derived = ['Case_AO', 'Case_AW', 'Case_WO'];
const subprocess_entities = ['Offer'];
const model_entities = {
    'Application': { idField: 'case', dbDoc: { EventOrigin: "Application" } },
    'Workflow': {
        idField: 'case', dbDoc: {
            $or: [{ EventOrigin: "Workflow" },
                { Activity: "O_Create Offer" }]
        }
    },
    'Offer': {
        idField: 'OfferID', dbDoc: {
            $and: [{ EventOrigin: "Offer" },
                { $not: { Activity: "O_Create Offer" } }]
        },
        subprocessInitializer: "O_Create Offer:COMPLETE"
    },
};
const model_relations = [
    { derivedEntityType: 'Case_AO', nt1: 'Application', nt2: 'Offer' },
    { derivedEntityType: 'Case_AW', nt1: 'Application', nt2: 'Workflow' },
    { derivedEntityType: 'Case_WO', nt1: 'Workflow', nt2: 'Offer' }
];
const csvPath = "../dcr-event-knowledge-graphs/dataset/Logs_for_Neo4J/BPIC17/BPI_Challenge_2017.csv"; //"path/to/BPI_Challenge_2017.csv";
const checkDBDoc = (dbDoc, row) => {
    let retval = true;
    for (const key in dbDoc) {
        if (key === "$or") {
            retval = retval && dbDoc[key].reduce((acc, val) => acc || checkDBDoc(val, row), false);
        }
        else if (key === "$and") {
            retval = retval && dbDoc[key].reduce((acc, val) => acc && checkDBDoc(val, row), true);
        }
        else if (key === "$not") {
            retval = retval && !(checkDBDoc(dbDoc[key], row));
        }
        else {
            retval = retval && (dbDoc[key] === row[key]);
        }
    }
    return retval;
};
const isPartOfSubprocess = (row) => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer)
            return true;
        if (model_entities[entity].subprocessInitializer !== undefined && checkDBDoc(model_entities[entity].dbDoc, row))
            return true;
    }
    return false;
};
const getEventId = (row) => {
    for (const entity in model_entities) {
        if (row.Activity + ":" + row.lifecycle === model_entities[entity].subprocessInitializer)
            return row[model_entities[entity].idField];
    }
    for (const entity in model_entities) {
        if (checkDBDoc(model_entities[entity].dbDoc, row))
            return row[model_entities[entity].idField];
    }
    throw new Error("Mismatching row!");
};
const generateOCLog = async (db, rowToActivity) => {
    console.log("Generating log");
    const rawTraces = {};
    const log = {
        activities: new Set(),
        traces: {}
    };
    for (const row of await (0, loadDB_1.dbFind)(db, {})) {
        if (!rawTraces[row.case]) {
            rawTraces[row.case] = [];
        }
        const event = rowToActivity(row);
        log.activities.add(event.activity);
        rawTraces[row.case].push({ event, timestamp: new Date(row.timestamp) });
    }
    for (const traceId in rawTraces) {
        log.traces[traceId] = rawTraces[traceId].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).map(en => en.event);
    }
    return log;
};
const getRandomInt = (min, max) => {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
};
const getRandomItem = (set) => {
    let items = Array.from(set);
    return items[Math.floor(Math.random() * items.length)];
};
const noisify = (trace, noisePercentage, activities, subProcessActivities) => {
    const retTrace = [];
    const ids = trace.map(event => event.attr.id).filter(id => id !== "");
    for (let i = 0; i < trace.length; i++) {
        if (Math.random() <= noisePercentage) {
            const choice = getRandomInt(0, 3);
            switch (choice) {
                // Insert
                case 0:
                    retTrace.push(trace[i]);
                    const activity = getRandomItem(activities);
                    retTrace.push({ activity, attr: { id: subProcessActivities.has(activity) ? getRandomItem(new Set(ids)) : "" } });
                    break;
                // Delete
                case 1:
                    break;
                // Swap
                case 2:
                    const elem = retTrace.pop();
                    retTrace.push(trace[i]);
                    if (elem !== undefined) {
                        retTrace.push(elem);
                    }
                    break;
                default: throw new Error("Wrong integer mate " + choice);
            }
        }
        else {
            retTrace.push(trace[i]);
        }
    }
    return retTrace;
};
const main = async () => {
    console.log("Loading db...");
    let t = (0, utility_1.timer)();
    const db = await (0, loadDB_1.default)(csvPath, sampleIds, rowFilter);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    const graph = await (0, ekg_1.default)(db, include_entities, model_entities, model_relations);
    const aggCorrInv = (0, utility_1.flipEventMap)((0, ocDiscovery_1.aggregateCorrelations)(graph));
    const subProcessEvents = new Set(subprocess_entities.flatMap((ent) => [model_entities[ent].subprocessInitializer, ...aggCorrInv[ent]]));
    console.log("Discovering Base Graph...");
    t = (0, utility_1.timer)();
    const model = (0, ocDiscovery_1.DisCoverOCDcrGraph)(graph, model_entities_derived, model_entities);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    console.log("Finding closures...");
    t = (0, utility_1.timer)();
    const closures = (0, ocDiscovery_1.findRelationClosures)(graph);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    console.log("Making closure log...");
    t = (0, utility_1.timer)();
    const interfaceLog = (0, ocDiscovery_1.makeLogFromClosure)(closures, graph);
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    console.log("Finding interface exclusions...");
    t = (0, utility_1.timer)();
    const interfaceAbs = (0, ocDiscovery_1.abstractLog)(interfaceLog);
    const aggregatedCorrelations = (0, ocDiscovery_1.aggregateCorrelations)(graph);
    const interfaceAtMostOnce = (0, ocDiscovery_1.filterBasedOnAggregatedCorrelations)(interfaceAbs.atMostOnce, subprocess_entities, aggregatedCorrelations);
    const { getSubProcessGraph, getSubProcess } = (0, ocDiscovery_1.initializeGetSubProcess)(aggregatedCorrelations, model_entities);
    for (const activity of interfaceAtMostOnce) {
        if (getSubProcess(activity) === "")
            continue;
        const subProcessGraph = getSubProcessGraph(model, activity);
        const interfaceEvent = subProcessGraph.eventToInterface[activity];
        subProcessGraph.excludesTo[interfaceEvent].add(interfaceEvent);
    }
    const { nonCoExisters, precedesButNeverSucceeds } = (0, ocDiscovery_1.getNonCoexistersAndNotSuccesion)(interfaceAbs, subprocess_entities, aggregatedCorrelations);
    for (const event in precedesButNeverSucceeds) {
        if (getSubProcess(event) === "")
            continue;
        const subProcessGraph = getSubProcessGraph(model, event);
        const interfaceEvent = subProcessGraph.eventToInterface[event];
        for (const s of precedesButNeverSucceeds[event]) {
            if (!interfaceAtMostOnce.has(s)) {
                subProcessGraph.excludesTo[interfaceEvent].add(getSubProcessGraph(model, s).eventToInterface[s]);
            }
        }
    }
    const addInterFaceConstraints = (rel, key) => {
        for (const activity in rel) {
            if (getSubProcess(activity) === "")
                continue;
            const subProcessGraph = getSubProcessGraph(model, activity);
            const interfaceEvent = subProcessGraph.eventToInterface[activity];
            const setToUnion = new Set([...rel[activity]].map(otherActivity => subProcessGraph.eventToInterface[otherActivity]));
            subProcessGraph[key][interfaceEvent].union(setToUnion);
        }
    };
    addInterFaceConstraints(nonCoExisters, "excludesTo");
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    const interFaceOCLog = (0, ocDiscovery_1.makeOCLogFromClosure)(closures, graph, model_entities, subprocess_entities);
    console.log("Finding interface conditions / responses...");
    t = (0, utility_1.timer)();
    const { conditions, responses } = (0, ocDiscovery_1.findConditionsResponses)(interFaceOCLog, model_entities);
    addInterFaceConstraints(conditions, "conditionsFor");
    addInterFaceConstraints(responses, "responseTo");
    console.log("DONE! Took " + t.stop() / 1000 + " seconds");
    console.log("Writing model...");
    (0, fsInteraction_1.writeSerializedGraph)(model, "FullModel");
    const logWithSubprocess = await generateOCLog(db, (row) => ({ activity: row.Activity + ":" + row.lifecycle, attr: { id: (isPartOfSubprocess(row) ? getEventId(row) : "") } }));
    console.log(`
        Accepting traces (flattened by case): ${(0, objectCentric_1.OCReplay)(logWithSubprocess, model, model_entities)} / ${Object.keys(logWithSubprocess.traces).length}
    `);
    console.log(`
        Accepting traces (closure log): ${(0, objectCentric_1.OCReplay)(interFaceOCLog, model, model_entities)} / ${Object.keys(interFaceOCLog.traces).length}
    `);
    let count = 0;
    if (align) {
        for (const traceId in logWithSubprocess.traces) {
            const trace = logWithSubprocess.traces[traceId];
            const noisyTrace = noisify(trace, 0.1, logWithSubprocess.activities, subProcessEvents);
            const spawnIds = noisyTrace.map(event => event.attr.id).filter(id => id !== "");
            const t = (0, utility_1.timer)();
            const modelPP = (0, objectCentric_1.addOptimization)(model, spawnIds);
            const bitModelPP = (0, ocAlign_1.ocDCRToBitDCR)(modelPP, spawnIds);
            const engine = {
                execute: (event, graph) => (0, ocAlign_1.bitOCExecutePP)(event, graph, model_entities),
                getEnabled: ocAlign_1.bitGetEnabled,
                isEnabled: (event, graph) => (0, ocAlign_1.bitOCIsEnabled)(event, graph, model_entities),
                isAccepting: ocAlign_1.bitIsAccepting,
                executeStr: ocAlign_1.bitExecutePP,
            };
            console.log("Aligning noisy trace...");
            console.log("DONE! Cost: " + (0, ocAlign_1.default)(noisyTrace, bitModelPP, engine, spawnIds, model_entities).cost);
            console.log("Took " + t.stop() / 1000 + " seconds");
            if (++count === 10)
                break;
        }
    }
};
main();
