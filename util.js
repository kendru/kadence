function indent(str, spaces = 4) {
    return str
        .split('\n')
        .map(line => `${' '.repeat(spaces)}${line}`)
        .join('\n');
}

module.exports = {
    indent
};