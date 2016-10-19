'use strict';
const scriptInfo = {
    name: 'Channels',
    file: 'channelUtils.js',
    desc: 'Channel Utilities',
    createdBy: 'Dave Richer'
};

module.exports = app => {

    // Part Channel
    const part = (to, fro, text, message) => {
      let textArray = text.split(' ');
      if (!textArray.length) {
          app.say(from, 'I need some more information...');
          return;
      }
      let [channel] = textArray;
      if(!app.isInChannel(channel)) {
        app.say(from, `I am not in the channel ${channel}`);
        return
      }
      // Part the channel
      app._ircClient.part(channel, () => {
          app.say(from, `I have parted ${channel}`);
      });
    };
    app.Commands.set('part', {
        desc: 'part [channel] Part a channel',
        access: app.Config.accessLevels.owner,
        call: part
    });

    // Join Channel
    const join = (to, from, text, message) => {
        let textArray = text.split(' ');
        if (!textArray.length) {
            app.say(from, 'I need some more information...');
            return;
        }
        let [channel] = textArray;

        // Join the channel
        app._ircClient.join(channel, () => {
            app.say(from, `I have joined ${channel}`);
        });

    };
    app.Commands.set('join', {
        desc: 'join [channel] Join a channel',
        access: app.Config.accessLevels.owner,
        call: join
    });

    // OP Someone
    const op = (to, from, text, message) => {
        let textArray = text.split(' ');
        if (!textArray.length < 2) {
            app.say(from, 'I need some more information...');
            return;
        }
        let [channel, nick] = textArray;
        if(!app.isInChannel(channel) || !app.isInChannel(channel, nick)) {
          app.say(from, `Either I or ${nick} am not in ${channel}, so no one is getting ops..`);
          return;
        }
        app._ircClient.send('mode', channel, '+o', nick);
        app.say(from, 'I have given all the power to ' + nick + ' on ' + channel);
    };
    // Terminate the bot and the proc watcher that keeps it up
    app.Commands.set('op', {
        desc: 'op [channel] [nick] : Give someone all the powers..',
        access: app.Config.accessLevels.owner,
        call: op
    });

    // Return the script info
    return scriptInfo;
};