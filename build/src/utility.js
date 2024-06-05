"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unionGraphs = exports.subset = exports.setEqual = exports.intersect = exports.flipEventMap = exports.safeUnion = exports.safeAdd = exports.copyHiDcr = exports.copyDCRGraph = exports.copyMarking = exports.LogAbsSize = exports.HiDCRSize = exports.DCRSize = exports.eventMapSize = exports.copyEventMap = exports.copySet = exports.setMinus = exports.timer = exports.printFull = exports.strFull = void 0;
const util_1 = __importDefault(require("util"));
const performance_now_1 = __importDefault(require("performance-now"));
const strFull = (obj) => util_1.default.inspect(obj, { showHidden: false, depth: null, colors: true });
exports.strFull = strFull;
const printFull = (...obj) => console.log((0, exports.strFull)(obj));
exports.printFull = printFull;
// Time in milliseconds
const timer = () => {
    const start = (0, performance_now_1.default)();
    return {
        stop: () => {
            const end = (0, performance_now_1.default)();
            const time = (end - start);
            return time;
        }
    };
};
exports.timer = timer;
const setMinus = (s1, s2) => {
    const retSet = new Set();
    for (const elem of s1) {
        if (!s2.has(elem))
            retSet.add(elem);
    }
    return retSet;
};
exports.setMinus = setMinus;
const copySet = (set) => {
    return new Set(set);
};
exports.copySet = copySet;
// Makes deep copy of a eventMap
const copyEventMap = (eventMap) => {
    const copy = {};
    for (const startEvent in eventMap) {
        copy[startEvent] = new Set(eventMap[startEvent]);
    }
    return copy;
};
exports.copyEventMap = copyEventMap;
const eventMapSize = (em) => {
    let retval = 0;
    for (const key in em) {
        retval += em[key].size;
    }
    return retval;
};
exports.eventMapSize = eventMapSize;
const DCRSize = (graph) => {
    return (0, exports.eventMapSize)(graph.conditionsFor) +
        (0, exports.eventMapSize)(graph.responseTo) +
        (0, exports.eventMapSize)(graph.includesTo) +
        (0, exports.eventMapSize)(graph.excludesTo) +
        (0, exports.eventMapSize)(graph.milestonesFor);
};
exports.DCRSize = DCRSize;
const HiDCRSize = (graph) => {
    return Object.values(graph.spawns).reduce((acc, val) => acc + (0, exports.DCRSize)(val), (0, exports.DCRSize)(graph));
};
exports.HiDCRSize = HiDCRSize;
const LogAbsSize = (abs) => {
    return abs.atMostOnce.size +
        (0, exports.eventMapSize)(abs.chainPrecedenceFor) +
        (0, exports.eventMapSize)(abs.precedenceFor) +
        (0, exports.eventMapSize)(abs.predecessor) +
        (0, exports.eventMapSize)(abs.responseTo) +
        (0, exports.eventMapSize)(abs.successor);
};
exports.LogAbsSize = LogAbsSize;
const copyMarking = (marking) => {
    return {
        executed: (0, exports.copySet)(marking.executed),
        included: (0, exports.copySet)(marking.included),
        pending: (0, exports.copySet)(marking.pending),
    };
};
exports.copyMarking = copyMarking;
const copyDCRGraph = (graph) => {
    return {
        events: (0, exports.copySet)(graph.events),
        conditionsFor: (0, exports.copyEventMap)(graph.conditionsFor),
        responseTo: (0, exports.copyEventMap)(graph.responseTo),
        excludesTo: (0, exports.copyEventMap)(graph.excludesTo),
        milestonesFor: (0, exports.copyEventMap)(graph.milestonesFor),
        includesTo: (0, exports.copyEventMap)(graph.includesTo),
        marking: (0, exports.copyMarking)(graph.marking)
    };
};
exports.copyDCRGraph = copyDCRGraph;
const copyHiDcr = (graph) => {
    const retGraph = {
        ...(0, exports.copyDCRGraph)(graph),
        spawns: {}
    };
    for (const spawnEvent in graph.spawns) {
        retGraph.spawns[spawnEvent] = (0, exports.copyDCRGraph)(graph.spawns[spawnEvent]);
    }
    return retGraph;
};
exports.copyHiDcr = copyHiDcr;
const safeAdd = (em, key, val) => {
    if (!em[key])
        em[key] = new Set();
    em[key].add(val);
};
exports.safeAdd = safeAdd;
const safeUnion = (em, key, val) => {
    if (key in em) {
        em[key].union(val);
    }
    else {
        em[key] = val;
    }
};
exports.safeUnion = safeUnion;
const flipEventMap = (em) => {
    const retval = {};
    for (const event of Object.keys(em)) {
        retval[event] = new Set();
    }
    for (const e1 in em) {
        for (const e2 of em[e1]) {
            if (!retval[e2])
                retval[e2] = new Set();
            retval[e2].add(e1);
        }
    }
    return retval;
};
exports.flipEventMap = flipEventMap;
const intersect = (s1, s2) => {
    const retset = new Set();
    const { smallestSet, otherSet } = s1.size > s2.size ? { smallestSet: s2, otherSet: s1 } : { smallestSet: s1, otherSet: s2 };
    for (const elem of smallestSet) {
        if (otherSet.has(elem))
            retset.add(elem);
    }
    return retset;
};
exports.intersect = intersect;
const setEqual = (s1, s2) => {
    if (s1.size !== s2.size)
        return false;
    for (const elem of s1) {
        if (!s2.has(elem))
            return false;
    }
    return true;
};
exports.setEqual = setEqual;
const subset = (s1, s2) => {
    for (const elem of s1) {
        if (!s2.has(elem))
            return false;
    }
    return true;
};
exports.subset = subset;
// Mutates graph1
const unionGraphs = (graph1, graph2) => {
    graph1.events.union(graph2.events);
    const unionRel = (rel1, rel2) => {
        for (const key in rel2) {
            if (!rel1[key]) {
                rel1[key] = (0, exports.copySet)(rel2[key]);
            }
            else {
                rel1[key].union(rel2[key]);
            }
        }
    };
    unionRel(graph1.conditionsFor, graph2.conditionsFor);
    unionRel(graph1.responseTo, graph2.responseTo);
    unionRel(graph1.excludesTo, graph2.excludesTo);
    unionRel(graph1.includesTo, graph2.includesTo);
    unionRel(graph1.milestonesFor, graph2.milestonesFor);
    for (const key in graph1.marking) {
        graph1.marking[key].union(graph2.marking[key]);
    }
};
exports.unionGraphs = unionGraphs;
