class Address {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
    }

    equals(other) {
        if (this === other) {
            return true;
        }
        if (!other) {
            return false;
        }

        return this.ip === other.ip && this.port === other.port;
    }

    toString() {
        return `${this.ip}:${this.port}`;
    }
}

module.exports = Address;