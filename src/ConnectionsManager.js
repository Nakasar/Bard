const ytdl = require('ytdl-core');

class ConnectionManager {
    constructor() {
        this.connections = new Map();
        this.dispatchers = new Map();
    }

    addConnection(connection) {
        connection.volume = 1;
        this.connections.set(connection.channel.guild.id, connection);
    }

    removeConnection(server) {
        this.connections.delete(server);
    }

    play(server, url) {
        return Promise.resolve().then(() => {
            const c = this.connections.get(server);
            if (!url) {
                throw { message: "No url provided.", id: "NO_URL" };
            }
            if (!c) {
                throw {message : "No connection found.", id: "NOT_CONNECTED" };
            }
            
            const dispatcher = c.playStream(ytdl(url, { filter: 'audioonly' }));
            dispatcher.setVolume(c.volume);
            this.dispatchers.set(server, dispatcher);
        });
    }

    async getVolume(server) {
        const connection = this.connections.get(server);
        if (!connection) {
            throw {message : "No connection found.", id: "NO_JOIN" };
        }

        return parseInt(connection.volume * 100);
    }

    setVolume(server, volume) {
        return Promise.resolve().then(() => {
            if (!volume || isNaN(volume) || volume < 0 || volume > 100) {
                throw { message: "No valid volume provided 0-100.", id: "NO_VOLUME" };
            }

            const connection = this.connections.get(server);
            if (!connection) {
                throw {message : "No connection found.", id: "NO_JOIN" };
            }

            connection.volume = volume/100;

            const dispatcher = this.dispatchers.get(server);
            if (dispatcher) {
                dispatcher.setVolume(volume/100);
            }

            return true;
        });
    }

    pause(server) {
        return Promise.resolve().then(() => {
            const dispatcher = this.dispatchers.get(server);
            if (!dispatcher) {
                throw {message : "No dispatcher found.", id: "NO_PLAY" };
            }

            dispatcher.pause();
            return true;
        });
    }

    resume(server) {
        return Promise.resolve().then(() => {    
            const dispatcher = this.dispatchers.get(server);
            if (!dispatcher) {
                throw {message : "No dispatcher found.", id: "NO_PLAY" };
            }
            if (!dispatcher.paused) {
                throw {message : "No dispatcher paused.", id: "NO_PLAY" };
            }

            dispatcher.resume();
            return true;
        });
    }

    stop(server) {
        return Promise.resolve().then(() => {    
            const dispatcher = this.dispatchers.get(server);
            if (!dispatcher) {
                throw {message : "No dispatcher found.", id: "NO_PLAY" };
            }

            dispatcher.end();
            return true;
        }); 
    }
}

module.exports = new ConnectionManager();