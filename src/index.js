const Discord = require('discord.js');
const client = new Discord.Client();

const token = process.env.TOKEN || "";
const GAPI = process.env.GAPI || "";

const connectionManager = require('./ConnectionsManager');

const Axios = require('axios');

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Connected to: ${client.guilds.map(g => g).join(", ")}`)
});

client.on('message', async msg => {
  // Listen with prefix.
  if (!msg.content) {
    return;
  }

  const [prefix, ...args] = msg.content.split(" ");

  if (prefix !== "bard") {
    return;
  }

  if (args.length === 0) {
    msg.reply(makeHelp());
  }

  switch (args[0]) {
    case "aide":
    case "help":
      msg.channel.send({
        embed: {
          title: "Bard ♫ Aide",
          description: makeHelp(),
          color: 45000
        }
      });
      break;
    case "search":
    case "rechercher":
    case "cherche":
      const search = args.slice(1, ).join(" ");
      if (search.length === 0) {
        msg.reply("Je n'ai pas compris ce que je devais rechercher. Essayez `bard cherche <Nom de la Video>`");
      }

      Axios({
        method: "GET",
        url: "https://www.googleapis.com/youtube/v3/search",
        params: {
          part: "snippet",
          type: "video",
          key: GAPI,
          q: search
        }
      }).then(res => {
        const items = res.data.items;
        if (items.length === 0) {
          msg.reply("Je n'ai rien trouvé pour cette recherche.");
          return;
        }

        const videos = items.slice(0, 10).map(value => {
          return {
            title: value.snippet.title,
            id: value.id.videoId,
            channel: value.snippet.channelTitle,
            thumb: value.snippet.thumbnails.default.url
          }
        });

        let fields = videos.map((value, index) => {
          return {
            name: `${index} - ${value.title}`,
            value: `Par ${value.channel}.`,
          }
        });

        msg.channel.send({
          embed: {
            title: "Recherche sur Youtube",
            description: `Vous avez recherché : \`${search}\`. Entrez le numéro dans la liste pour ajouter la musique à la file de lecture.`,
            color: 45000,
            fields
          }
        }).then(() => {
          msg.channel.awaitMessages(
            response => !isNaN(response) && response >= 0 && response < videos.length,
            { maxMatches: 1, time: 30000, errors: ['time'] }
          )
            .then(collected => {
              const video = videos[collected.first().content];

              msg.channel.send("OK, jouons donc la video " + video.title);

              connectionManager.play(msg.guild.id, `https://www.youtube.com/watch?v=${video.id}`).then(() => {
                msg.reply("C'est parti ♫");
              }).catch(err => {
                if (err.id && err.id === "NOT_CONNECTED") {
                  msg.reply("Je ne suis pas connecté à un canal vocal. Tapez `bard join`.");
                  return;
                }
                
                msg.reply("Oups :(");
                console.error(err);
              });
            }).catch(collected => {
              msg.channel.send("Aucune vidéo selectionnée.");
            });
        });
      }).catch(err => {
        console.error(err);
        msg.reply("Je n'ai pas pu récupérer les informations de Youtube.");
      });
      break;
    case "play":
      const url = args[1];
      if (!url) {
        msg.reply("J'attends une url : `bard play <url>`.");
        return;
      }
      connectionManager.play(msg.guild.id, url).then(() => {
        msg.reply("C'est parti ♫");
      }).catch(err => {
        if (err.id && err.id === "NOT_CONNECTED") {
          msg.reply("Je ne suis pas connecté à un canal vocal. Tapez `bard join`.");
          return;
        }
        msg.reply("Oups :(");
        console.error(err);
      });
      break;
    case 'volume':
      const volume = args[1];
      if (!volume) {
        msg.reply("J'attends un volume : `bard volume <0-100>`.");
        return;
      }
      connectionManager.setVolume(msg.guild.id, volume).then(() => {
        msg.reply(`Volume à ${volume}%.`);
      }).catch(err => {
        if (err.id && err.id === "NO_PLAY") {
          msg.reply("Je ne suis pas en train de jouer. Tapez `bard play <url>`.");
          return;
        }
        if (err.id && err.id === "NO_VOLUME") {
          msg.reply("J'attends un volume entre 0 et 100. Tapez `bard volume <0-100>`.");
          return;
        }
        msg.reply("Oups :(");
        console.log(err);
      });
      break;
    case 'pause':
      connectionManager.pause(msg.guild.id).then(() => {
        msg.reply("Musique en pause. Tapez `bard reprise` pour que la fête revienne !");
      }).catch(err => {
        if (err.id && err.id === "NO_PLAY") {
          msg.reply("Je ne suis pas en train de jouer. Tapez `bard play <url>`.");
          return;
        }
        msg.reply("Oups :(");
        console.log(err);
      });
      break;
    case 'reprise':
    case 'resume':
      connectionManager.resume(msg.guild.id).then(() => {
        msg.reply("Et c'est reparti ♫");
      }).catch(err => {
        if (err.id && err.id === "NO_PLAY") {
          msg.reply("Je n'ai aucune musique en pause. Tapez `bard play <url>`.");
          return;
        }
        msg.reply("Oups :(");
        console.log(err);
      });
      break;
    case 'stop':
      connectionManager.stop(msg.guild.id).then(() => {
        msg.reply("Musique annulée, on joue autre chose ?");
      }).catch(err => {
        if (err.id && err.id === "NO_PLAY") {
          msg.reply("Je ne suis pas en train de jouer. Tapez `bard play <url>`.");
          return;
        }
        msg.reply("Oups :(");
        console.log(err);
      });
      break;
    case "join":
      if (msg.member.voiceChannel) {
        msg.reply("J'arrive !");
        const connection = await msg.member.voiceChannel.join();
        connectionManager.addConnection(connection);
      } else {
        msg.reply('Vous devez être dans un canal vocal.');
      }
      break;
    case "leave":
      msg.reply("A la prochaine !");
      msg.member.voiceChannel.leave();
      connectionManager.removeConnection(msg.guild.id);
      break;
  }
});

client.login(token);


function makeHelp() {
  return `Aide de Bard.
  bard aide
  bard join
  bard leave
  bard play <url>
  
  Un Bot par Nakasar. Invitez-moi avec [ce lien](https://discordapp.com/oauth2/authorize?&client_id=470243272715927554&scope=bot&permissions=36924480)`;
}