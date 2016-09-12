'use strict';
const Models = require('bookshelf-model-loader');

module.exports = app => {
    const topicsModel = Models.Topics;

    // Bailout if we do not have database
    if (!app.Database || !topicsModel) {
        return;
    }

    // Toppic logging handler
    const loggingCmd = (channel, topic, nick, message) => {
        topicsModel.create({
                channel: channel,
                topic: topic,
                nick: nick
            })
            .catch(err => {
                console.log(err.message);
            });
    };
    app.OnTopic.set('topicDbLogger', {
        call: loggingCmd,
        desc: 'Log Topics',
        name: 'topicDbLogger'
    });

    // Get the last 5 topics
    const topics = (to, from, text, message) => {
        let channel = text || to;
        topicsModel.query(qb => {
                qb
                    .where('channel', 'like', channel)
                    .orderBy('timestamp', 'desc')
                    .limit(5)
                    .select(['topic', 'nick', 'timestamp']);
            })
            .fetchAll()
            .then(results => {
                if (!results.length) {
                    app.say(to, `There is no data available for ${channel}`);
                    return;
                }
                app.say(to, `The Topic history has been private messaged to you ${from}`);
                let count = 0;
                results.each(result => {
                    app.say(from, `[${count}]: ${result.attributes.topic} | ${result.attributes.nick} on ${result.attributes.timestamp} `);
                    count = count + 1;
                });
            });
    };
    app.Commands.set('topics', {
        desc: '[channel] get the last 5 topics',
        access: app.Config.accessLevels.identified,
        call: topics
    });

    // Revert to the last known topic
    const revertTopic = (to, from, text, message) => {
        topicsModel.query(qb => {
                qb
                    .where('channel', 'like', to)
                    .orderBy('timestamp', 'desc')
                    .limit(2)
                    .select(['topic']);
            })
            .fetchAll()
            .then(results => {
                if(results.length < 2) {
                  app.say(to, 'There is not enough data available for this channel');
                  return;
                }
                app.say(to, `Attempting to revert the topic as per your request ${from}`);
                app._ircClient.send('topic', to, results.pluck('topic')[1]);
            });
    };
    app.Commands.set('topic-revert', {
        desc: 'Restore the topic in the active channel to its previous state',
        access: app.Config.accessLevels.admin,
        call: revertTopic
    });
};