'use strict';
const Moment = require('moment');
const Models = require('bookshelf-model-loader');


/**
    Database Specific Commands
    Commands: last-mentioned, random-line
**/
module.exports = app => {
    // Only enabled if there is a database available
    if (!app.Database && !Models.Logging) {
        return
    }

    // Grab the model
    const loggingModel = Models.Logging;

    const total = (to, from, text, message) => {
        loggingModel
            .where('to', '=', to)
            .count()
            .then(result => {
                app.say(to, `Total Messages from ${to}: ${result}`);
            });
    };

    const randomLine = (to, from, text, message) => {
        loggingModel.query(qb => {
                qb
                    .select('from', 'text')
                    .where('to', to)
                    .orderByRaw('rand()')
                    .limit(1)
            })
            .fetch()
            .then(result => {
                app.say(to, `${result.get('from')} : ${result.get('text')}`);
            });
    };

    const lastMentioned = (to, from, text, message) => {
        // No text was provided
        if (!text) {
            app.say(to, 'You did not enter in a word silly');
            return;
        }
        loggingModel
            .query(qb => {
                qb
                    .where('text', 'like', text)
                    .andWhere('to', 'like', to)
                    .orderBy('id', 'desc')
                    .limit(1);
            })
            .fetch()
            .then(result => {
                if (!result) {
                    app.say(to, 'Nothing was ever said like that in this this channel');
                    return;
                }

                let resFrom = result.get('from');
                let resTo = result.get('to');

                if (resTo === resFrom) {
                    // The request is from the originator of the private message
                    if (resfrom !== from) {
                        app.say(to, 'The last utterance of that was told to me in private and I am not willing to share');
                    }
                    // Request is from someone other then who sent the message
                    else {
                        app.say(from, `You said "${result.get('text')}" on ${Moment(result.get('timestamp')).format('hh:mm:ss a MMM Do YY')} in a private message`);
                    }
                } else {
                    // If it was not a private message
                    app.say(to, `${resFrom} said "${result.get('text')}" on ${Moment(result.get('timestamp')).format('hh:mm:ss a MMM Do YY')} in this channel`);
                }
            });
    };

    // Total Messages command
    app.Commands.set('total', {
        desc: 'Get total amount of recorded messages for the current channel',
        access: app.Config.accessLevels.identified,
        call: total
    });

    // random-line command
    app.Commands.set('random-line', {
        desc: 'Get a random line from the channel',
        access: app.Config.accessLevels.identified,
        call: randomLine
    });

    // last-mentioned command
    app.Commands.set('last-mentioned', {
        desc: '[phrase] Get the last time a word was mentioned',
        access: app.Config.accessLevels.identified,
        call: lastMentioned
    });
};
