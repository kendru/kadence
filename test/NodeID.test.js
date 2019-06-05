const { expect } = require('chai');
const NodeID = require('../NodeID');

describe('NodeID', () => {

    it('should initialize a new NodeID with random data', () => {
        const n1 = new NodeID();
        const n2 = new NodeID();

        expect(n1.buf.compare(n2.buf)).not.to.equal(0);
    });

    it('should initialize a new NodeID with the specified buffer', () => {
        const b = Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
        const n = new NodeID(b);

        expect(n.buf).to.equal(b);
    });

    it('should reject a buffer that is not 160 bits', () => {
        const b = Buffer.from([1, 2, 3]);
        expect(() => new NodeID(b)).to.throw();
    });

    it('should test equality', () => {
        const b1 = Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
        const b2 = Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
        const bOther = Buffer.from([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]);
        const n1 = new NodeID(b1);
        const n2 = new NodeID(b2);
        const nOther = new NodeID(bOther);

        expect(n1.equals(n2)).to.be.true;
        expect(n1.equals(nOther)).to.be.false;
    });

    it('should have a MIN value', () => {
        const n = new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
        expect(n.equals(NodeID.MIN)).to.be.true;
    });

    it('should have a MAX value', () => {
        const n = new NodeID(Buffer.from([255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]));
        expect(n.equals(NodeID.MAX)).to.be.true;
    });

    it('should expose a comparator', () => {
        expect(NodeID.compare(NodeID.MIN, NodeID.MIN)).to.equal(0);
        expect(NodeID.compare(NodeID.MIN, NodeID.MAX)).to.equal(-1);
        expect(NodeID.compare(NodeID.MAX, NodeID.MIN)).to.equal(1);
    });

    it('should interpret IDs as numbers with Little-Endian bit ordering', () => {
        const n1 = new NodeID(Buffer.from([255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
        const n2 = new NodeID(Buffer.from([0,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));
        expect(NodeID.compare(n1, n2)).to.equal(-1);
    });

    it('should get the distance to another NodeID as an XOR metric', () => {
        const n1 = new NodeID(Buffer.from([255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,0,0,0,0,0]));
        const n2 = new NodeID(Buffer.from([0,0,0,0,0,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]));
        const expectedDist = Buffer.from([255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255]);

        expect(n1.xorDistance(n2).equals(expectedDist)).to.be.true;
    });

    it('should get a representation of the NodeID as a hex string', () => {
        const n = new NodeID();
        expect(n.toString()).to.equal(n.buf.toString('hex'));
    });

    it('should get a comparator for the XOR distance from the current NodeID', () => {
        const nBase = new NodeID(Buffer.from([255, 255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

        // Distance should be: FF 00 00...
        const nNear = new NodeID(Buffer.from([0,   255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

        // Distance should be: 00 FF 00 ...
        const nFar  = new NodeID(Buffer.from([255, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]));

        const comparator = nBase.distanceComparator();

        expect(comparator(nNear, nFar)).to.equal(-1);
        expect(comparator(nFar, nNear)).to.equal(1);
        expect(comparator(nFar, nFar)).to.equal(0);
    });

    it('should test whether a node has a given bit prefix', () => {
        // Prefix: 00001111 00001111...
        const n = new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,15,15]));

        // Test prefix: 0
        expect(n.hasPrefix(Buffer.from([0]), 1)).to.be.true;

        // Test prefix: 00000
        expect(n.hasPrefix(Buffer.from([0]), 5)).to.be.false;

        // Test prefix: 00001111
        expect(n.hasPrefix(Buffer.from([15]), 8)).to.be.true;

        // Test prefix: 00001111 0000
        expect(n.hasPrefix(Buffer.from([0, 15]), 12)).to.be.true;

        // Test prefix: 00001111 00000000
        expect(n.hasPrefix(Buffer.from([0, 15]), 16)).to.be.false;
    });

    it('should always consider a NodeID as having an empty prefix', () => {
        const n = new NodeID();

        expect(n.hasPrefix(Buffer.from([]), 0)).to.be.true;
    });

    it('should throw an error when the prefix is larger than a NodeID', () => {

    });

    it('should throw an error when the buffer is shorter than the declared bit length', () => {

    });

    it('should iterate the from most significant to least', () => {
        const n = new NodeID(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,147]));
        const bits = [...n];
        const firstByte = bits.slice(0, 8);
        const restBytes = bits.slice(8);

        // 147 = 0b10010011
        expect(firstByte).to.eql([1, 0, 0, 1, 0, 0, 1, 1]);
        expect(restBytes.reduce((acc, x) => acc + x, 0)).to.equal(0);
    });
});