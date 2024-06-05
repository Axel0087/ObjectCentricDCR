"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEKG = exports.isEntityRels = exports.isDirectlyFollows = exports.isCorrelations = exports.isEventNodes = exports.isEntityNodes = exports.isEntityNode = exports.isEventNode = exports.isDict = exports.isArray = exports.isStringSet = exports.isValidDate = exports.isSet = exports.BitSet = void 0;
class BitSet {
    constructor(params) {
        const realParams = params;
        if (realParams?.size) {
            this.size = realParams.size;
            this.set = realParams.set;
            this.map = realParams.map;
        }
        else {
            this.size = realParams.allElems.size;
            this.map = {};
            this.set = 0n;
            let mask = 1n;
            for (const elem of realParams.allElems) {
                this.map[elem] = mask;
                if (realParams.startingElems.has(elem)) {
                    this.set = this.set | mask;
                }
                mask = mask << 1n;
            }
        }
    }
    *[Symbol.iterator]() {
        for (const elem in this.map) {
            if (this.has(this.map[elem])) {
                yield elem;
            }
        }
    }
    clear() {
        this.set = 0n;
        return this;
    }
    copy() {
        return new BitSet({ size: this.size, set: this.set, map: this.map });
    }
    print() {
        console.log(this.set.toString(2));
    }
    isEmpty() {
        return this.set === 0n;
    }
    has(elem) {
        return !!(elem & this.set);
    }
    hasString(elem) {
        const mask = this.map[elem];
        if (mask === undefined)
            throw new Error("Unknown elem: " + elem);
        return !!(mask & this.set);
    }
    compliment() {
        this.set = ~this.set;
        return this;
    }
    add(elem) {
        this.set = this.set | elem;
        return this;
    }
    addString(elem) {
        try {
            const mask = this.map[elem];
            this.set = this.set | mask;
            return this;
        }
        catch (e) {
            console.log(elem, this.map[elem]);
            console.log(Object.keys(this.map));
            throw e;
        }
    }
    delete(elem) {
        this.set = this.set & ~(elem);
        return this;
    }
    deleteString(elem) {
        const mask = this.map[elem];
        this.set = this.set & (~mask);
        return this;
    }
    union(otherSet) {
        this.set = this.set | otherSet.set;
        return this;
    }
    intersect(otherSet) {
        this.set = this.set & otherSet.set;
        return this;
    }
    difference(otherSet) {
        this.set = this.set & (~otherSet.set);
        return this;
    }
}
exports.BitSet = BitSet;
const isSet = (obj) => {
    return typeof obj === "object" && obj instanceof Set;
};
exports.isSet = isSet;
const isValidDate = (obj) => {
    return obj && Object.prototype.toString.call(obj) === "[object Date]" && !isNaN(obj);
};
exports.isValidDate = isValidDate;
const isString = (obj) => {
    return typeof obj === "string";
};
const isStringSet = (obj) => {
    if ((0, exports.isSet)(obj)) {
        return forVals(obj, isString);
    }
    return false;
};
exports.isStringSet = isStringSet;
const isArray = (obj) => {
    return typeof obj === "object" && obj instanceof Array;
};
exports.isArray = isArray;
const forKeys = (obj, pred) => {
    for (const key in obj) {
        if (!pred(key))
            return false;
    }
    return true;
};
const forVals = (obj, pred) => {
    for (const val of obj) {
        if (!pred(val))
            return false;
    }
    return true;
};
const isDict = (obj) => {
    if (typeof obj === "object" && !(0, exports.isArray)(obj) && !(0, exports.isSet)(obj)) {
        return forKeys(obj, isString);
    }
    ;
    return false;
};
exports.isDict = isDict;
const isEventNode = (obj) => {
    return isString(obj?.eventId) && isString(obj?.activityName) && (0, exports.isValidDate)(obj?.timestamp);
};
exports.isEventNode = isEventNode;
const isEntityNode = (obj, entityTypes) => {
    return isString(obj?.entityId) && entityTypes.has(obj?.entityType);
};
exports.isEntityNode = isEntityNode;
const isEntityNodes = (obj, entityTypes) => {
    return (0, exports.isDict)(obj) && forKeys(obj, (key) => (0, exports.isEntityNode)(obj[key], entityTypes) && obj[key].entityId === key);
};
exports.isEntityNodes = isEntityNodes;
const isEventNodes = (obj) => {
    return (0, exports.isDict)(obj) && forKeys(obj, (key) => (0, exports.isEventNode)(obj[key]) && obj[key].eventId === key);
};
exports.isEventNodes = isEventNodes;
const isCorrelations = (obj, eventNodes, entityNodes, entityTypes) => {
    return (0, exports.isDict)(obj) && forKeys(obj, (key) => {
        return eventNodes[key] !== undefined && (0, exports.isDict)(obj[key]) && forKeys(obj[key], (key2) => {
            return entityTypes.has(key2) && forVals(obj[key][key2], (val) => entityNodes[val] !== undefined);
        });
    });
};
exports.isCorrelations = isCorrelations;
const isDirectlyFollows = (obj, entityNodes, eventNodes) => {
    return (0, exports.isDict)(obj) && forKeys(obj, (key) => {
        return entityNodes[key] !== undefined &&
            (0, exports.isArray)(obj[key]) &&
            forVals(obj[key], (val) => (0, exports.isEventNode)(val) && eventNodes[val.eventId] !== undefined);
    });
};
exports.isDirectlyFollows = isDirectlyFollows;
const isEntityRels = (obj, entityNodes) => {
    return (0, exports.isDict)(obj) && forKeys(obj, (key) => {
        return entityNodes[key] !== undefined && forVals(obj[key], (val) => entityNodes[val] !== undefined);
    });
};
exports.isEntityRels = isEntityRels;
const print = false;
const shortCircuitLog = (msg) => {
    print && console.log(msg);
    return true;
};
const isEKG = (obj) => {
    return ((0, exports.isStringSet)(obj?.entityTypes) && shortCircuitLog("ent types") &&
        (0, exports.isEventNodes)(obj?.eventNodes) && shortCircuitLog("event nodes") &&
        (0, exports.isEntityNodes)(obj?.entityNodes, obj.entityTypes) && shortCircuitLog("entity nodes") &&
        (0, exports.isCorrelations)(obj?.correlations, obj.eventNodes, obj.entityNodes, obj.entityTypes) && shortCircuitLog("correls") &&
        (0, exports.isDirectlyFollows)(obj?.directlyFollows, obj.entityNodes, obj.eventNodes) && shortCircuitLog("dfs") &&
        (0, exports.isDirectlyFollows)(obj?.derivedDFs, obj.entityNodes, obj.eventNodes) && shortCircuitLog("derived dfs") &&
        (0, exports.isEntityRels)(obj?.entityRels, obj.entityNodes) && shortCircuitLog("rels"));
};
exports.isEKG = isEKG;
