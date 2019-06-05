const dgram = require('dgram');
const assert = require('assert');
const { indent } = require('./util');
const messages = require('./messages');
const Address = require('./net/Address');

// Generates a randum uinteger in the range, [0, n)
function randNum(n) {
    return Math.floor(Math.random() * n);
}


class Network {
    constructor() {
        // We represent ports as indexes into the "assignments" array
        this.nextPort = 0;
        this.assignments = [];
    }

    join(node) {
        const port = this.nextPort++;
        this.assignments[port] = node;
        return new Address('INTERNAL', port);
    }

    leave(addr) {
        delete this.assignments[addr.port];
    }

    sendTo(source, address, message) {
        const node = this.assignments[address.port];
        if (!node) {
            console.warn(`No route to address: ${address}`);
            return;
        }
        // TODO: simulate latency and unreliability
        setTimeout(() => {
            node.receive(source, message);
        }, 0);
    }

    toString() {
        return this.assignments
            .map((node, idx) => `${idx}:\n${indent(node.toString())}`)
            .join('\n');
    }
}

class UDPOverlayNetwork {
    constructor(bindAddr = '0.0.0.0') {
        this.nextPort = 3147;
        this.nodesByPort = {};
        this.bindAddr = bindAddr;
    }

    async join(node) {
        const server = dgram.createSocket('udp4');
        const addr = new Address(this.bindAddr, this.nextPort++);
        this.nodesByPort[addr.port] = node;

        return new Promise((resolve, reject) => {
            let listening = false;

            server.on('error', (err) => {
                console.log(`server error:\n${err.stack}`);
                server.close();
                if (!listening) {
                    reject();
                }
            });

            server.on('message', (data, rinfo_) => {
                // Send port is not the same as receive port...
                const sourceLength = data[0];
                const [ ip, port ] = data.slice(1, 1 + sourceLength).toString('utf8').split(':');
                const source = new Address(ip, parseInt(port));
                const message = messages.decode(data.slice(1 + sourceLength));
                node.receive(source, message);
            });

            server.on('listening', () => {
                listening = true;
                resolve(addr);
            });

            server.bind(addr.port);
        });
    }

    leave(addr) {
        delete this.nodesByPort[addr.port];
    }

    sendTo(source, address, message) {
        const client = dgram.createSocket('udp4');
        const sourceBuf = Buffer.from(source.toString(), 'utf8');
        assert(sourceBuf.length < 256, 'Source should be shorter than 256 bytes');
        const data = Buffer.concat([ Buffer.from([sourceBuf.length]), sourceBuf, messages.encode(message) ]);
        client.send(data, address.port, address.ip, (err) => {
            if (err) {
                console.error(`Error sending message from ${source} to ${address}`, err);
            }
            client.close();
        });
    }

    toString() {
        return '<UDP>';
    }
}

class Node {
    constructor() {
        this.network = null;
        this.address = null;
        // Assign a fake location on a 1000x1000 grid so that the network can simulate latency
        // and unreliable delivery
        this.location = [randNum(1000), randNum(1000)];
    }

    get isConnected() {
        return this.network !== null;
    }

    async connect(network) {
        this.network = network;
        this.address = await network.join(this);
    }

    disconnect() {
        assert(this.isConnected, 'Cannot disconnect - not currently connected');
        this.network.leave(this.address);
        this.network = null;
        this.address = null;
    }

    send(destinationAddress, message) {
        if (destinationAddress.equals(this.address)) {
            console.warn('Not sending message to self', message);
            return;
        }
        this.network.sendTo(this.address, destinationAddress, message);
    }

    receive(senderAddress, message) {
        console.error(`${this.constructor.name} does not implement Node::receive()`);
        throw new Error(`${this.constructor.name} does not implement Node::receive()`);
    }

    toString() {
        return `Node@${this.location[0]},${this.location[1]}`;
    }
}

module.exports = {
    Network,
    UDPOverlayNetwork,
    Node
};