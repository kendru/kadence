const { expect } = require('chai');
const NodeID = require('../NodeID');
const KademliaNode = require('../KademliaNode');
const { Entry, Node } = require('../RoutingTable');
const { K } = require('../constants');

describe('RoutingTable', () => {

    describe('Entry', () => {

        it('should stringify an entry', () => {
            const n = new NodeID();
            const addr = 123;
            const entry = new Entry(n, addr);

            expect(entry.toString()).to.equal(`<${n}, 123>`);
        });
    });

    describe('Node', () => {
        let n;
        let kNode;

        beforeEach(() => {
            n = new Node();
            kNode = new KademliaNode();
        })

        it('should create an instance with default parameters', () => {
            expect(n.depth).to.equal(0);
            expect(n.prefix.equals(Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]))).to.be.true;
            expect(n.left).to.be.null;
            expect(n.right).to.be.null;
            expect(n.kBucket).to.be.empty;
        });

        it('should insert an entry in the initial Node\'s k-bucket', () => {
            const entryId = new NodeID();
            const entry = new Entry(entryId, 123);
            n.insert(kNode, entry);
        });

        it('should split the initial node when its k-bucket is full', () => {
            for (let i = 0; i < K; i++) {
                const entry = new Entry(new NodeID(), i+1);
                n.insert(kNode, entry);
            }
            expect(n.left).to.be.null;
            expect(n.right).to.be.null;

            const entry = new Entry(new NodeID(), 100);
            n.insert(kNode, entry);

            expect(n.left).be.an.instanceOf(Node);
            expect(n.right).be.an.instanceOf(Node);
        });

        it('should check whether it already has a given entry', () => {
            const entryId = new NodeID();
            const entry = new Entry(entryId, 123);

            // Populate w/ a number of entries
            n.insert(kNode, entry);
            for (let i = 0; i < 100; i++) {
                const entry = new Entry(new NodeID(), i+1);
                n.insert(kNode, entry);
            }

            expect(n.has(entry)).to.be.true;
            expect(n.has(new Entry(new NodeID(), 456))).to.be.false;
        });

        it('should remove an entry', () => {
            const entry = new Entry(new NodeID(), 123);
            n.insert(kNode, entry);
            expect(n.has(entry)).to.be.true;

            n.remove(entry);
            expect(n.has(entry)).to.be.false;
        });

        it('Should move a update a node when it seen by moving it to the end of its k-bucket', () => {
            const entryId = new NodeID();
            const entry = new Entry(entryId, 123);

            n.insert(kNode, entry);
            n.insert(kNode, new Entry(new NodeID(), 456));

            expect(n.kBucket[0]).to.equal(entry);

            n.updateLastSeen(entry);

            expect(n.kBucket[1]).to.equal(entry);
        });

        // it('should test deeper tables:', () => {
        //     for (let i = 0; i < 100; i++) {
        //         const entry = new Entry(new NodeID(), i+1);
        //         n.insert(kNode, entry);
        //     }
        //     console.log(n.toString());
        // });
    });
});