'use strict';
/*
  Exprimental and not currently working
*/

const scriptInfo = {
    name: 'Waston Personality',
    desc: 'Test Script for watson personality',
    createdBy: 'IronY'
};

var PersonalityInsightsV3 = require('watson-developer-cloud/personality-insights/v3');

const Models = require('bookshelf-model-loader');
const helpers = require('../../helpers');
const logger = require('../../lib/logger');
const moment = require('moment');
const _ = require('lodash');

module.exports = app => {
    // Make sure we have everything we need
    if (!app.Config.apiKeys.watson.personality || !app.Config.apiKeys.watson.personality.userName || !app.Config.apiKeys.watson.personality.password || !app.Database || !Models.Logging) {
        return scriptInfo;
    }

    const pI = new PersonalityInsightsV3({
        headers: {
            'X-Watson-Learning-Opt-Out': true
        },
        username: app.Config.apiKeys.watson.personality.userName,
        password: app.Config.apiKeys.watson.personality.password,
        version_date: '2016-10-19'
    });

    const getResults = (nick) =>
        Models.Logging.query(qb => {
            qb
                .where('from', 'like', nick)
                .andWhere('text', 'not like', 's/%')
                .orderBy('timestamp', 'desc');
        })
        .fetchAll();

    // Get the users overall sentiment
    const personify = (to, from, text, message) => {
        // No Nick Provided
        if (!text) {
            app.say(to, 'A nick is required for the personify command');
            return;
        }

        getResults(text)
            .then(results => {
                let contentItems = [];
                results.each(model => {
                    contentItems.push({
                        content: model.get('text'),
                        id: model.get('id'),
                        userid: model.get('from'),
                        sourceid: model.get('to'),
                        created: moment(model.get('timestamp')).unix(),
                        contentType: 'text/plain',
                        language: 'en',
                    });
                });
                pI.profile({
                    contentItems: contentItems
                }, (error, response) => logger.error('Watson personality error:', {error: error || response}));
            })
            .catch(err => logger.error('Watson personality error:', {err}));
    };
    app.Commands.set('personify', {
        desc: '[Nick] Get a detailed Personal report',
        access: app.Config.accessLevels.owner,
        call: personify
    });


    return scriptInfo;
};
