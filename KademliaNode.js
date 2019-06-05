const assert = require('assert');
const { indent } = require('./util');
const NodeID = require('./NodeID');
const {
    Node: NetworkNode
 } = require('./Network');
const {
    Node: RoutingTableNode,
    Entry: RoutingTableEntry
 } = require('./RoutingTable');
const {
    Ping, PingReply,
    Store, StoreReply,
    FindNode, FindNodeReply,
    FindValue, FindValueReply
} = require('./messages');
const { K, A } = require('./constants');

function timeout(ms, message = 'unknown') {
    return new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Timed out: ${message}`)), ms);
    });
}

class KademliaNode extends NetworkNode {
    constructor() {
        super();
        this.id = new NodeID();
        this.routingTable = new RoutingTableNode();
        this.responseCallbacks = {};

        // TODO: make this pluggable
        this.storage = new Map();
    }

    // Public API
    async bootstrap(bootstrapNodeID, address) {
        assert(this.isConnected, 'Cannot bootstrap node - not currently connected to network');
        const initialEntry = new RoutingTableEntry(bootstrapNodeID, address);
        this._updateRoutingTable(initialEntry);
        await this._lookupNodes(this.id);
    }

    async set(key, value) {
        const id = NodeID.fromStringKey(key);
        const nodesEntries = await this._lookupNodes(id);
        await Promise.race(nodesEntries.map(entry => this.doStore(entry, id, value)));
    }

    async get(key) {
        const id = NodeID.fromStringKey(key);
        return this._getLocalValue(id) || (await this._lookupValue(id));
    }
    // END Public API

    // TODO: Make these pluggable
    _setLocalValue(key, val) {
        // console.debug(`Setting value @ ${this.id}`, key.toString('hex'), val);
        this.storage.set(key.toString('hex'), val);
    }
    _getLocalValue(key) {
        // console.debug(`Getting value @ ${this.id}`, key.toString('hex'), this.storage.get(key.toString('hex')));
        return this.storage.get(key.toString('hex'));
    }

    async doPing(entry) {
        return await this.performRPC(entry, Ping);
    }

    async doFindNode(entry, id) {
        return await this.performRPC(entry, FindNode, id);
    }

    async doFindValue(entry, id) {
        return await this.performRPC(entry, FindValue, id);
    }

    async doStore(entry, id, value) {
        return await this.performRPC(entry, Store, id, value);
    }


    async _lookupValue(id) {
        const nodeIDComparator = id.distanceComparator();
        const entryComparator = (a, b) => nodeIDComparator(a.nodeID, b.nodeID);
        let closestEntries = this._findClosest(id, A);
        if (closestEntries.length === 0) {
            console.warn(`No nodes found. Is the current node connected to the network? ${this.id}`);
            return [];
        }

        let lookupNodes = [this.id];

        closestEntries.sort(entryComparator);
        let candidateNodes = closestEntries;
        let numHops = 0;
        while (++numHops) {
            const findNodePromises = candidateNodes.map(entry => this.doFindValue(entry, id));
            const foundMessages = Array.prototype.concat.apply([], await Promise.all(findNodePromises));
            const foundEntries = [];
            for (const msg of foundMessages) {
                if (msg.value) {
                    return msg.value;
                }
                Array.prototype.push.apply(foundEntries, msg.entries);
            }
            foundEntries.sort(entryComparator);

            let closerCandidateEntries = [];
            for (const foundEntry of foundEntries) {
                if (entryComparator(foundEntry, candidateNodes[0]) > -1) {
                    break;
                }

                if (foundEntry.nodeID.equals(this.id)) {
                    continue;
                }

                closerCandidateEntries.push(foundEntry);
            }

            // If no nodes closer than closestEntries found, break out of the loop
            if (closerCandidateEntries.length === 0) {
                break;
            }

            // Prepend any closer nodes that we found, and truncate to at most K entries
            closestEntries = [...closerCandidateEntries, ...closestEntries].slice(0, K);

            // For the next pass, query up to A of the closer nodes found
            candidateNodes = closerCandidateEntries.slice(0, A);
        }
        // console.debug(`Lookup value took ${numHops} hops`);

        return null;
    }

    /**
     * Finds up to K nodes closest to the given ID
     *
     * @param {NodeID} id The id for which to locate nodes
     * @returns {Array<RoutingTableEntry>} Entries for the up to K nodes closest to `id`
     */
    async _lookupNodes(id) {
        const nodeIDComparator = id.distanceComparator();
        const entryComparator = (a, b) => nodeIDComparator(a.nodeID, b.nodeID);
        let closestEntries = this._findClosest(id, A);
        if (closestEntries.length === 0) {
            console.warn(`No nodes found. Is the current node connected to the network? ${this.id}\n`, this.routingTable.toString());
            return [];
        }

        closestEntries.sort(entryComparator);
        let candidateNodes = closestEntries;
        let numHops = 0;
        while (++numHops) {
            const findNodePromises = candidateNodes.map(async (entry) => {
                const res = await this.doFindNode(entry, id);
                return res.entries;
            });
            const foundEntries = Array.prototype.concat.apply([], await Promise.all(findNodePromises));
            foundEntries.sort(entryComparator);

            let closerCandidateEntries = [];
            for (let foundEntry of foundEntries) {
                if (typeof foundEntry === 'undefined') {
                    console.error({
                        numHops,
                        id,
                        closestEntries,
                        foundEntries
                    });
                    console.error('Undefined entry');
                    throw new Error('Undefined entry');
                }
                if (entryComparator(foundEntry, candidateNodes[0]) > -1) {
                    break;
                }
                if (foundEntry.nodeID.equals(this.id)) {
                    continue;
                }
                closerCandidateEntries.push(foundEntry);
            }

            // If no nodes closer than closestEntries found, break out of the loop
            if (closerCandidateEntries.length === 0) {
                break;
            }

            // Prepend any closer nodes that we found, and truncate to at most K entries
            closestEntries = [...closerCandidateEntries, ...closestEntries].slice(0, K);

            // For the next pass, query up to A of the closer nodes found
            candidateNodes = closerCandidateEntries.slice(0, A);
        }
        // console.debug(`Lookup node took ${numHops} hops`);

        return closestEntries;
    }

    receive(senderAddress, message) {
        const { originNodeID, cookie } = message;
        const routingTableEntry = new RoutingTableEntry(originNodeID, senderAddress);
        this._updateRoutingTable(routingTableEntry);
        // console.debug(`Got ${message.type()} from node ${originNodeID.toString('hex')}`);

        const cb = this.responseCallbacks[cookie];
        if (cb) {
            cb(message);
            return;
        }

        switch (message.type()) {
        case 'Ping':
            this.replyRPC(senderAddress, message, PingReply);
            break;
        case 'FindNode':
            const entries = this._findClosest(message.key);
            this.replyRPC(senderAddress, message, FindNodeReply, entries);
            break;
        case 'FindValue':
            const val = this._getLocalValue(message.key);
            if (typeof val !== 'undefined') {
                // TODO: If I know of a node that is closer, check if it has the value.
                // If so, cache this info. If not, send it a STORE and record that it has
                // the record.
                // Maybe even have the initiatir of a STORE send an extra flag to the closest
                // node indicating that it is the primary copy. On the check for closer nodes,
                // only store if I am the primary copy for a key and the other node is closer.
                // I will then mark myself as a replica.
                this.replyRPC(senderAddress, message, FindValueReply, val, null);
            } else {
                // No local value - find closest nodes
                const entries = this._findClosest(message.key);
                this.replyRPC(senderAddress, message, FindValueReply, null, entries);
            }
            break;
        case 'Store':
            this._setLocalValue(message.key, message.value);
            this.replyRPC(senderAddress, message, StoreReply);
            break;
        default:
            console.error(`${super.toString()}:${this.id.toString('hex')}: Cannot handle message of type: ${message.type()}`);
        }
        // console.debug(this.describe(), `received message from address ${senderAddress}:`, message);
    }

    async performRPC(destination, MessageClass, ...args) {
        const msg = new MessageClass(this.id, ...args);
        const replyPromise = new Promise((resolve) => {
            this.responseCallbacks[msg.cookie] = resolve;
        });
        this.send(destination.address, msg);

        // Wait for reply or timeout, and clean up the callback regardless.
        try {
            return await Promise.race([
                replyPromise,
                timeout(1000)
            ]);
        } catch (err) {
            console.error('Error waiting for reply', err);
            // timed out
            this._removeFromRoutingTable(destination);
            // TODO: Find any keys that are stored by self that were closer to the missing node
            // than to self and re-transmit STORE
        } finally {
            delete this.responseCallbacks[msg.cookie];
        }
    }

    replyRPC(replyAddress, origMessage, MessageClass, ...args) {
        const msg = new MessageClass(this.id, ...args);
        msg.cookie = origMessage.cookie;
        this.send(replyAddress, msg);
    }

    async _updateRoutingTable(routingTableEntry) {
        if (this.routingTable.has(routingTableEntry)) {
            this.routingTable.updateLastSeen(routingTableEntry);
            return;
        }

        this.routingTable.insert(this, routingTableEntry);

        // TODO:
        // If the oldest node we have seen responds to ping, move it to
        // the end of the list. Otherwise, remove it, and append the new node
    }

    _removeFromRoutingTable(routingTableEntry) {
        this.routingTable.remove(routingTableEntry);
    }

    /**
     * Searches for up to `n` nodes closest to `id` that are already in
     * the current node's routing table.
     *
     * @param {NodeId} id NodeID for which to find nodes
     * @param {Number} n (optional) Maximum number of entries to return. Default = K.
     * @param {Array<RoutingTableEntry>} Entries for up to `n` nodes closest to `id`
     */
    _findClosest(id, n = K) {
        const closestTableEntry = this.routingTable.find(id);
        let closestNodes = [...closestTableEntry.kBucket];
        if (closestNodes.length >= n) {
            return closestNodes.slice(0, n);
        }

        let leftmostNode = closestTableEntry.prev;
        let rightmostNode = closestTableEntry.next;
        while (closestNodes.length < n) {
            if (leftmostNode !== null) {
                closestNodes = closestNodes.concat(leftmostNode.kBucket);
                leftmostNode = leftmostNode.prev;
            } else if (rightmostNode === null) {
                // We have exausted the whole routing table.
                // Return what we have found
                return closestNodes;
            }

            if (rightmostNode !== null) {
                closestNodes = closestNodes.concat(rightmostNode.kBucket);
                rightmostNode = rightmostNode.next;
            }
        }

        return closestNodes.slice(0, n);
    }

    toString() {
        return `${super.toString()}:${this.id.toString('hex')}\n${indent(`Storing ${this.storage.size} keys`)}\n${indent(this.routingTable.toString())}`;
    }
}

module.exports = KademliaNode;