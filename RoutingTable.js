const assert = require('assert');
const { indent } = require('./util');
const { K } = require('./constants');
const NodeID = require('./NodeID');
const Address = require('./net/Address');


/**
 * One possible optimization would be to keep track of request latencies within
 * the routing table so that each node could estimate the latency of a request
 * and make lookups as efficient as possible.
 */

class Entry {
    constructor(nodeID, address) {
        this.nodeID = nodeID;
        this.address = address
    }

    hydrate(obj) {
        this.nodeID = (new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))).hydrate(obj.nodeID);
        const address = obj.address || {};
        this.address = new Address(address.ip, address.port);
        return this;
    }

    toJSON() {
        return {
            nodeID: this.nodeID.toJSON(),
            address: { ip: this.address.ip, port: this.address.port }
        };
    }

    equals(other) {
        if (this === other) {
            return true;
        }
        if (!other) {
            return false;
        }
        return this.nodeID.equals(other.nodeID) &&
            this.address.equals(other.address);
    }

    toString() {
        return `<${this.nodeID}, ${this.address}>`;
    }
}

class Node {
    constructor(depth = 0, prefix = null, kBucket = []) {
        this.depth = depth;
        this.prefix = Buffer.alloc(20);
        if (prefix) {
            prefix.copy(this.prefix, this.prefix.length - prefix.length, 0);
        }
        this.kBucket = kBucket;

        this.left = null;
        this.right = null;

        this.prev = null;
        this.next = null;
    }

    // Assuming that the current node is the root, finds the node
    // with the appropriate k-bucket for a given nodeId
    find(nodeID) {
        assert(this.depth === 0, 'Can only find() from root node');
        // Walk as far down in the tree as we can until we reach the longest
        // prefix of the NodeID that exists.
        let currentNode = this;
        for (let bit of [...nodeID]) {
            if (bit === 0) {
                if (currentNode.right === null) {
                    return currentNode;
                }
                currentNode = currentNode.right;
            }
            if (bit === 1) {
                if (currentNode.left === null) {
                    return currentNode;
                }
                currentNode = currentNode.left;
            }
        }
        console.error('Exhausted key space without coming to leaf of tree', nodeID);
        throw new Error('Exhausted key space without coming to leaf of tree');
    }

    has(entry) {
        return this.find(entry.nodeID).kBucket.some(e => e.equals(entry));
    }

    insert(selfNode, entry) {
        this.find(entry.nodeID)._insert(selfNode, entry);
    }

    remove(entry) {
        this.find(entry.nodeID)._remove(entry);
    }

    _insert(selfNode, entry) {
        if (this.kBucket.length < K) {
            this.kBucket.push(entry);
            return;
        }

        if (selfNode.id.hasPrefix(this.prefix, this.depth)) {
            this._split();
        }
    }

    _remove(entry) {
        this.kBucket = this.kBucket.filter(currentEntry => !entry.equals(currentEntry));
        if (this.kBucket.length === 0) {
            console.log('TODO: Remove if no entries remain in kbucket');
        }
    }

    _split() {
        const { kBucket } = this;
        const leftPrefix = Buffer.alloc(20);
        this.prefix.copy(leftPrefix);
        setBitFromMSB(leftPrefix, this.depth, 1);

        const rightPrefix = Buffer.alloc(20);
        this.prefix.copy(rightPrefix);
        // Explicitly zeroing this bit should not be nessary since we safely
        // (zero-filled) allocate the prefix buffer.
        setBitFromMSB(rightPrefix, this.depth, 0);

        let leftEntries = [];
        let rightEntries = [];
        for (const entry of kBucket) {
            if (entry.nodeID.hasPrefix(rightPrefix, this.depth + 1)) {
                rightEntries.push(entry);
            } else {
                leftEntries.push(entry);
            }
        }

        if (leftEntries.length === 0 || rightEntries.length === 0) {
            // All nodes are on 1 side of pivot - cannot split
            return;
        }

        this.kBucket = [];
        this.left = new Node(this.depth + 1, leftPrefix, leftEntries);
        this.right = new Node(this.depth + 1, rightPrefix, rightEntries);

        // Update prev/next links that are used for finding the next closest nodes to
        // a given ID.
        this.left.prev = this.prev;
        this.left.next = this.right;
        this.prev = null;

        this.right.prev = this.left;
        this.right.next = this.next;
        this.next = null;
    }

    updateLastSeen(entry) {
        const { kBucket } = this.find(entry.nodeID);
        for (let i = 0; i < kBucket.length; i++) {
            const e = kBucket[i];
            if (e.equals(entry)) {
                kBucket.splice(i, 1);
                kBucket.push(e);
                return;
            }
        }
    }

    allEntries() {
        if (!this.left) {
            return this.kBucket;
        }
        return [
            ...this.left.allEntries(),
            ...this.right.allEntries()
        ];
    }

    toString() {
        let out = `${this.depth}:${this.prefix.toString('hex')}:\n`;
        if (this.left !== null) {
            out += indent(`1 -> ${this.left.toString()}\n0 -> ${this.right.toString()}`);
        } else {
            out += indent(this.kBucket.map(entry => entry.toString()).join('\n'));
        }
        return out;
    }
}

function setBitFromMSB(buf, n, bit) {
    const idx = buf.length - Math.floor(n / 8) - 1;
    if (bit === 1) {
        const mask = (1 << (7 - (n % 8)));
        buf[idx] = buf[idx] | mask;
    } else {
        const mask = ~(1 << (7 - (n % 8)));
        buf[idx] = buf[idx] & mask;
    }
}

// // Remove if already seen - will append in the next step
// for (let i = 0; i < kBucket.length; i++) {
//     const seenNode = kBucket[i];
//     if (seenNode.nodeID === nodeID) {
//         kBucket.splice(i, 1);
//         break;
//     }
// }

module.exports = {
    Entry,
    Node
};