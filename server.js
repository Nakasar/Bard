const { Client, Intents } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const wait = require("util").promisify(setTimeout);
const Voice = require("@discordjs/voice");
const Koa = require("koa");
const ytdl = require("ytdl-core");
const play = require("play-dl");
const { google } = require("googleapis");

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.DIRECT_MESSAGES,
    Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_VOICE_STATES,
  ],
});

const players = new Map();

const token = process.env.DISCORD_TOKEN || "";
const testGuildId = "497531032850137088";

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const guilds = await client.guilds.fetch();

  console.log(`Connected to: ${guilds.map((g) => g.name).join(", ")}.`);
});

client.on("error", (err) => {
  console.error(err);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    return;
  }

  if (interaction.commandName === "pause") {
    if (!interaction.guild) {
      await interaction.reply({
        content:
          "Cette commande doit être lancée sur un serveur où je suis connecté en vocal.",
        ephemeral: true,
      });
      return;
    }

    const player = players.get(interaction.guild.id);

    if (!player) {
      await interaction.reply({
        content: "Je ne suis pas en train de jouer de la musique.",
        ephemeral: true,
      });
      return;
    }

    player.pause();

    await interaction.reply({
      content: "OK ! :pause_button:",
      ephemeral: true,
    });

    return;
  }

  if (interaction.commandName === "reprise") {
    if (!interaction.guild) {
      await interaction.reply({
        content:
          "Cette commande doit être lancée sur un serveur où je suis connecté en vocal.",
        ephemeral: true,
      });
      return;
    }

    const player = players.get(interaction.guild.id);

    if (!player) {
      await interaction.reply({
        content: "Je ne suis pas en train de jouer de la musique.",
        ephemeral: true,
      });
      return;
    }

    player.unpause();

    await interaction.reply({
      content: "OK ! :play_pause:",
      ephemeral: true,
    });

    return;
  }

  if (interaction.commandName === "stop") {
    if (!interaction.guild) {
      await interaction.reply({
        content:
          "Cette commande doit être lancée sur un serveur où je suis connecté en vocal.",
        ephemeral: true,
      });
      return;
    }

    const connection = Voice.getVoiceConnection(interaction.guild.id);

    if (!connection) {
      await interaction.reply({
        content: "Je suis pas connecté à un salon vocal de ce serveur.",
        ephemeral: true,
      });
      return;
    }

    const player = players.get(interaction.guild.id);
    players.delete(interaction.guild.id);
    player.player.stop();
    connection.destroy();

    await interaction.reply({
      content: "A bientôt ! :stop_button:",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "joue") {
    try {
      const voice = await interaction.guild.voiceStates.resolve(
        interaction.member.voice.id
      );

      if (!interaction.member || !interaction.member.voice.channel) {
        await interaction.reply({
          content:
            "Vous devez être dans un canal du même serveur pour jouer de la musique.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const url = interaction.options.getString("url");
      const videoUrls = [];

      if (
        !url.startsWith("https://youtube.com/watch?v=") &&
        !url.startsWith("https://www.youtube.com/watch?v=") &&
        !url.startsWith("https://music.youtube.com/watch?v=") &&
        !url.startsWith("https://youtu.be/") &&
        !url.startsWith("https://www.youtube.com/playlist?list=") &&
        !url.startsWith("https://youtube.com/playlist?list=")
      ) {
        await interaction.editReply({
          content:
            "Je ne peux lire des vidéo que depuis Youtube ou Youtube Music.",
          ephemeral: true,
        });
        return;
      }

      if (url.includes("list=")) {
        const urlParams = new URL(url);
        const playlistId = urlParams.searchParams.get("list");

        if (!playlistId) {
          await interaction.editReply({
            content: `Impossible de retrouver cette playlist. L'URL semble incorrecte.`,
            ephemeral: true,
          });

          return;
        }

        try {
          const videoIds = await getVideoIdsInPlaylist(playlistId);
          videoUrls.push(
            ...videoIds.map((id) => `https://youtube.com/watch?v=${id}`)
          );
        } catch (error) {
          await interaction.editReply({
            content: `Impossible de retrouver cette playlist. Elle est peut-être privée !`,
            ephemeral: true,
          });

          return;
        }
      } else {
        videoUrls.push(url);
      }

      const existingPlayer = players.get(interaction.guild.id);

      if (existingPlayer && existingPlayer.current) {
        existingPlayer.queue.push(...videoUrls);

        await interaction.editReply({
          content: `Ajouté à la file d'attente : ${url}`,
          ephemeral: true,
        });

        return;
      }

      const connection =
        Voice.getVoiceConnection(interaction.guild.id) ||
        Voice.joinVoiceChannel({
          channelId: interaction.member.voice.channel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

      if (existingPlayer) {
        existingPlayer.current = videoUrls.splice(0, 1)[0];
        existingPlayer.queue.push(...videoUrls);
        existingPlayer.player.play(
          await createResource(existingPlayer.current)
        );

        await interaction.editReply({
          content: `Et c'est parti pour la suite ! ${url}`,
          ephemeral: true,
        });

        return;
      } else {
        const player = Voice.createAudioPlayer({
          behaviors: {
            noSubscriber: Voice.NoSubscriberBehavior.play,
          },
        });
        const memoryPlayer = {
          player: player,
          current: videoUrls.splice(0, 1)[0],
          queue: videoUrls,
        };

        player.on("error", (error) => {
          console.error(error);
        });

        player.on(Voice.AudioPlayerStatus.Idle, async () => {
          memoryPlayer.current = undefined;
          if (memoryPlayer.queue.length > 0) {
            const [nextUrl] = memoryPlayer.queue.splice(0, 1);

            memoryPlayer.player.play(await createResource(nextUrl));
            memoryPlayer.current = nextUrl;
          }
        });

        connection.subscribe(player);

        player.play(await createResource(memoryPlayer.current));

        players.set(interaction.guild.id, memoryPlayer);
      }

      await interaction.editReply({
        content: `En avant la musique ! ${url}`,
        ephemeral: true,
      });
      return;
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content:
          "Oups, je ne peux pas jouer cette vidéo à cause d'une erreur, elle est peut-être restreinte à une limite d'âge ou bloquée.",
        ephemeral: true,
      });
      return;
    }
  }

  if (interaction.commandName === "queue") {
    if (!interaction.guild) {
      await interaction.reply({
        content:
          "Cette commande doit être lancée sur un serveur où je suis connecté en vocal.",
        ephemeral: true,
      });
      return;
    }

    const connection = Voice.getVoiceConnection(interaction.guild.id);

    if (!connection) {
      await interaction.reply({
        content: "Je suis pas connecté à un salon vocal de ce serveur.",
        ephemeral: true,
      });
      return;
    }

    const player = players.get(interaction.guild.id);

    if (!player) {
      await interaction.reply({
        content: "Aucune file d'attente en cours de lecture.",
        ephemeral: true,
      });
      return;
    }

    if (player.queue.length === 0) {
      await interaction.reply({
        content: `Actuellement en cours : ${player.current}.\n\nLa file d'attente est vide.`,
        ephemeral: true,
      });
      return;
    } else {
      await interaction.reply({
        content: `Actuellement en cours : ${
          player.current
        }.\n\nEn file d'attente :${player.queue.join("\n")}`,
        ephemeral: true,
      });
      return;
    }
  }

  if (interaction.commandName === "skip") {
    if (!interaction.guild) {
      await interaction.reply({
        content:
          "Cette commande doit être lancée sur un serveur où je suis connecté en vocal.",
        ephemeral: true,
      });
      return;
    }

    const connection = Voice.getVoiceConnection(interaction.guild.id);

    if (!connection) {
      await interaction.reply({
        content: "Je suis pas connecté à un salon vocal de ce serveur.",
        ephemeral: true,
      });
      return;
    }

    const player = players.get(interaction.guild.id);

    if (!player) {
      await interaction.reply({
        content: "Aucune file d'attente en cours de lecture.",
        ephemeral: true,
      });
      return;
    }

    if (player.queue.length === 0) {
      await interaction.reply({
        content: `La file d'attente est vide.`,
        ephemeral: true,
      });
      return;
    } else {
      const [nextUrl] = player.queue.splice(0, 1);

      player.player.play(await createResource(nextUrl));
      player.current = nextUrl;

      await interaction.reply({
        content: `Passage à la musique suivante : ${player.current}`,
        ephemeral: true,
      });
      return;
    }
  }
});

async function createResource(url) {
  const stream = await play.stream(url);

  const resource = Voice.createAudioResource(stream.stream, {
    inputType: stream.type,
  });

  return resource;
}

async function syncTestCommands() {
  const clientId = process.env.DISCORD_CLIENT_ID;

  const commands = [
    new SlashCommandBuilder()
      .setName("joue")
      .setDescription(
        "Joue une musique dans le canal vocal de l'utilisateur ou l'ajoute à la file d'attente courante."
      )
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("URL de la video à lire")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("queue")
      .setDescription("Affiche la file d'attente des musiques."),
    new SlashCommandBuilder()
      .setName("stop")
      .setDescription(
        "Arrêter la musique, vider la file d'attente, et quitter le canal."
      ),
    new SlashCommandBuilder()
      .setName("skip")
      .setDescription("Passer la musique courante."),
    new SlashCommandBuilder()
      .setName("pause")
      .setDescription("Cesser temporairement de jouer la musique."),
    new SlashCommandBuilder()
      .setName("reprise")
      .setDescription("Reprendre la lecture de la musique."),
  ];

  const rest = new REST({ version: "9" }).setToken(token);

  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

async function getVideoIdsInPlaylist(playListId) {
  google.options({
    auth: process.env.GAPI,
  });
  const result = await google.youtube("v3").playlistItems.list({
    part: ["id", "contentDetails"],
    maxResults: 50,
    playlistId: playListId,
  });

  return result.data.items.map((item) => item.contentDetails.videoId);
}

client.login(token);
syncTestCommands();

const app = new Koa();

app.use(async (ctx) => {
  ctx.status = 200;
  ctx.body = { message: "bot started" };
});

app.listen(process.env.PORT);
