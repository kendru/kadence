const { Network, UDPOverlayNetwork } = require('./Network');
const { NODE_COUNT, K } = require('./constants');
const KademliaNode = require('./KademliaNode');

process.on('unhandledRejection', error => {
    console.error('unhandledRejection', error);
});

function randomNode(nodes) {
    const idx = Math.floor(Math.random() * nodes.length);
    return nodes[idx];
}

async function main () {
    const network = new UDPOverlayNetwork();
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
        const node = new KademliaNode();
        await node.connect(network);
        nodes.push(node);
    }

    console.time('bootstrap');
    for (let i = 1; i < nodes.length; i++) {
        const src = nodes[i];
        let dest = nodes[i-1]; //randomNode(nodes);
        // while(dest === src) {
        //     dest = randomNode(nodes);
        // }
        // Bootstrap via ping and recursive self-lookup against known node
        await src.bootstrap(dest.id, dest.address);
    }
    console.timeEnd('bootstrap');

    console.time('store');
    for (let i = 0; i < 100; i++) {
        await randomNode(nodes).set(`${i}:name`, `Andrew the ${i}th`);
        await randomNode(nodes).set(`${i}:age`, i % 80);
    }
    console.timeEnd('store');

    // Should be tolerant to about k failures...
    // let disconnectedNodes = [];
    // for (let i = 0; i < K-1; i++) {
    //     const idx = Math.floor(Math.random() * nodes.length);
    //     nodes[idx].disconnect();
    //     disconnectedNodes.push(nodes[idx]);
    //     nodes.splice(idx, 1);
    // }

    console.time('retrieval');
    console.log(await randomNode(nodes).get("50:name"));
    console.timeEnd('retrieval');

    // console.log(randomNode(nodes).toString());

    // // Test that the nodes closest to the ID are *actually* closer than any others
    // const n1 = new NodeID();
    // const closest = nodes[0]._findClosest(n1);
    // const closestSet = new Set(closest.map(e => e.nodeID));
    // const allEntries = nodes[0].routingTable.allEntries();
    // const nodesByCloseness = allEntries.map(e => e.nodeID).sort(n1.distanceComparator());

    // const firstCloseNodes = nodesByCloseness.slice(0, 5);
    // for (const cn of firstCloseNodes) {
    //     if (!closestSet.has(cn)) {
    //         throw new Error('Somethin else was closer :(')
    //     }
    // }
    // console.log('Node count: ' + allEntries.length);
    // console.log('\tClose: ' + closest.length);
}

main();
