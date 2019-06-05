const crypto = require('crypto');
const assert = require('assert');

class NodeID {
    constructor(buf = null) {
        // TODO: Form NodeID as a 256-bit hash of IP/Port with optional nonce
        // Several other places will need to be updated to use 256 bits instead
        // of 160, but this will allow for more common
        if (buf === null) {
            buf = crypto.randomBytes(20);
        } else {
            assert(buf.length === 20, 'NodeID bust be 160 bits');
        }

        this.buf = buf;
    }

    /**
     * Gets the XOR distance metric to another given NodeID
     *
     * @param {NodeID} other
     * @return {Buffer} XOR distance
     */
    xorDistance(other) {
        const distanceBuf = Buffer.allocUnsafe(20);

        for (let i = 0; i < 20; i++) {
            distanceBuf[i] = this.buf[i] ^ other.buf[i];
        }

        return distanceBuf;
    }

    /**
     * Gets a comparator function that sorts other nodes based on their XOR distance
     * metric from the current nodeID
     */
    distanceComparator() {
        return (a, b) => {
            const distA = this.xorDistance(a);
            const distB = this.xorDistance(b);

            return compareBufLittleEndian(distA, distB);
        }
    }

    /**
     * Determine if this NodeID has a given bit prefix.
     *
     * Since a NodeID is interpreted as a Little Endian number, and
     * we define a prefix as the most significant bits of the number,
     * the prefix of a NodeID starts at its highest-addressed byte.
     */
    hasPrefix(buf, bitLength) {
        assert(bitLength <= 160, `Expected a prefix of <= 160 bits. Got: ${bitLength}`);
        assert(buf.length*8 >= bitLength, `Expected buffer to be at least ${bitLength} bits. Was: ${buf.length*8}`);

        let currentBit = bitLength;
        while (currentBit > 0) {
            const byteOffset = Math.floor((bitLength - currentBit) / 8) + 1;
            const bitPosition = (bitLength - currentBit) % 8;
            // console.log({ byteOffset, bitPosition });

            const selfByte = this.buf[this.buf.length - byteOffset];
            const cmpByte = buf[buf.length - byteOffset];

            const selfBit = (selfByte & Math.pow(2, 7-bitPosition)) >> (7-bitPosition);
            const cmpBit = (cmpByte & Math.pow(2, 7-bitPosition)) >> (7-bitPosition);

            // console.log(selfByte.toString(2).padStart(8, '0'))
            // console.log(selfBit.toString(2).padStart(bitPosition+1, ' '));
            // console.log(cmpByte.toString(2).padStart(8, '0'))
            // console.log(cmpBit.toString(2).padStart(bitPosition+1, ' '));
            // console.log('---------------');

            if (selfBit !== cmpBit) {
                return false;
            }

            currentBit--;
        }

        return true;
    }

    /**
     * Iterate over the bits of the key from most significant to least
     */
    *[Symbol.iterator]() {
        for (let i = 19; i >= 0; i--) {
            const byte = this.buf[i];
            yield ((byte & 0x80) >> 7) & 255;
            yield ((byte & 0x40) >> 6) & 255;
            yield ((byte & 0x20) >> 5) & 255;
            yield ((byte & 0x10) >> 4) & 255;
            yield ((byte & 0x08) >> 3) & 255;
            yield ((byte & 0x04) >> 2) & 255;
            yield ((byte & 0x02) >> 1) & 255;
            yield ((byte & 0x01) >> 0) & 255;
        }
    }

    hydrate(obj) {
        this.buf = Buffer.from(obj, 'base64');
        return this;
    }

    toJSON() {
        return this.buf.toString('base64');
    }

    equals(other) {
        return this.buf.equals(other.buf);
    }

    toString() {
        return this.buf.toString('hex');
    }
}
NodeID.MIN = new NodeID(Buffer.from([  0,   0,   0,   0,   0,  0,    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0]));
NodeID.MAX = new NodeID(Buffer.from([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255]));
// Compare as Little-Endian numbers
NodeID.compare = (a, b) => compareBufLittleEndian(a.buf, b.buf);
NodeID.fromStringKey = (str) => {
    const hash = crypto.createHash('sha1');
    hash.update(str);
    return new NodeID(hash.digest());
}

function compareBufLittleEndian(a, b) {
    const len = a.length;
    assert(b.length === len, 'Can only compare buffers of equal length');

    for (let i = len; i >= 0; i--) {
        const bA = a[i];
        const bB = b[i];
        if (bA < bB) {
            return -1;
        }
        if (bA > bB) {
            return 1;
        }
    }
    return 0;
}

module.exports = NodeID;