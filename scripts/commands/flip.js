'use strict';
const scriptInfo = {
    name: 'flip',
    desc: 'Simulate a coin toss, Random Engine test script',
    createdBy: 'IronY'
};
const random = require('../../lib/randomEngine');
const ircTypo = require('../lib/_ircTypography');

module.exports = app => {
    // Flip a coin
    app.Commands.set('flip', {
        desc: '[heads / tails] Flip a coin',
        access: app.Config.accessLevels.guest,
        call: (to, from, text, message) => {
            const [selection] = text.split(' ');
            let answer = false;
            switch (selection) {
                case 'heads':
                    answer = true;
                    break;
                case 'tails':
                    answer = false;
                    break;
                default:
                    answer = random.bool();
                    break;
            }

            const rand = random.bool();
            const randString = rand ? 'heads' : 'tails';
            const answerString = answer ? 'heads' : 'tails';
            const outcomeString = rand === answer ? 'Winner' : 'Loser';

            const sb = new ircTypo.StringBuilder();
            sb
                .append(`${from}, your coin landed on`)
                .appendBold(randString)
                .append('you picked')
                .appendBold(answerString)
                .append('you are the')
                .appendBold(outcomeString);

            app.say(to, sb.toString());
        }
    });

    // Return the script info
    return scriptInfo;
};
