'use strict';

const scriptInfo = {
    name: 'urlListener',
    file: 'urlListener.js',
    desc: 'Listen for URLS, append them to a DB table, clean them if they expire, and other stuff',
    createdBy: 'Dave Richer'
};

const c = require('irc-colors');
const _ = require('lodash');
const xray = require('x-ray')();
const GoogleUrl = require('google-url');
const HashMap = require('hashmap');
const Models = require('bookshelf-model-loader');
const helpers = require('../../helpers');
const conLogger = require('../../lib/consoleLogger');
const rp = require('request-promise-native');

/**
  Translate urls into Google short URLS
  Listeners: shorten
  Npm Requires: google-url
**/
module.exports = app => {
    // Google API Key required
    if (!app.Config.apiKeys.google) {
        return;
    }

    const cronTime = '00 01 * * *';

    // Ignore the users entirely
    const userIgnore = app.Config.features.urls.userIgnore || [];

    // Ignore URL logging for specific channels
    const urlLoggerIgnore = app.Config.features.urls.loggingIgnore || [];

    // Anounce Ignore
    const announceIgnore = app.Config.features.urls.announceIgnore || [];

    // Google API
    const googleUrl = new GoogleUrl({
        key: app.Config.apiKeys.google
    });

    // Cache URLS to prevent unnecessary API calls
    const urlCache = new HashMap();

    // Send To Pusher
    const pusher = (url, to, from, results) => {
        return new Promise((resolve, reject) => {
            // Load in pusher if it is active
            if (!app.Config.pusher.enabled && !app._pusher) {
                resolve(results);
                return;
            }
            // Decide which pusher channel to push over
            let channel = /\.(gif|jpg|jpeg|tiff|png)$/i.test(url) ? 'image' : 'url';
            // Grab a timestamp
            let timestamp = Date.now();
            // Prepare Output
            let output = {
                url,
                to,
                from,
                timestamp,
                // If this is a youtube video, use the vide title rather then the title
                title: (results.youTube && results.youTube.videoTitle) ? results.youTube.videoTitle : results.title || ''
            };
            // Include an ID if we have one
            if (results.id) {
                output.id = results.id;
            }
            // Include a ShortUrl if we have one
            if (results.shortUrl) {
                output.shortUrl = results.shortUrl;
            }

            // Set output to Pusher
            app._pusher.trigger('public', channel, output);

            // Append results
            results.delivered.push({
                protocol: 'pusher',
                to: channel,
                on: timestamp
            });

            resolve(results);
        });
    };

    // Log Urls to the Database
    const logInDb = (url, to, from, message, results) => {
        let ignored = urlLoggerIgnore.some(hash => {
            if (_.includes(hash, _.toLower(to))) {
                return true;
            }
        });
        if (!app.Database || !Models.Url || ignored) {
            resolve(results);
            return;
        }
        return new Promise((resolve, reject) => {
            // Log the URL
            return Models.Url.create({
                    url: url,
                    to: to,
                    from: from,
                    title: results.title
                })
                .then(record => {
                    results.id = record.id;
                    results.delivered.push({
                        protocol: 'urlDatabase',
                        on: Date.now()
                    });
                    resolve(results);
                })
                .catch((err) => {
                    resolve(results);
                });
        })
        .then(results => {
          console.log(results);
          // Log Youtube Url
          if(results.youTube) {
            return Models.YouTubeLink.create({
              url: url,
              to: to,
              from: from,
              title: results.youTube.videoTitle,
              user: message.user,
              host: message.host
            })
            .then(record => {
              results.delivered.push({
                  protocol: 'youTubeDatabase',
                  on: Date.now()
              });
              resolve(results);
            })
            .catch((err) => {
                resolve(results);
            });
          }
        });
    };

    // Begin the chain
    const startChain = url => new Promise((resolve, reject) => {
        if (!url) {
            reject({
                message: 'A URL is required'
            });
            return;
        }
        resolve({
            url,
            delivered: [],
            secure: url.startsWith('https://'),
        });
    });

    // Shorten the URL
    const shorten = (url, results) => new Promise((resolve, reject) => {
        // Check input / Gate
        if (url.startsWith('http://goo.gl/') || url.startsWith('https://goo.gl/')) {
            resolve(results);
            return;
        }
        if (urlCache.has(url)) {
            resolve(_.merge(results, {
                shortUrl: urlCache.get(url)
            }));
            return;
        }
        googleUrl.shorten(url, (err, shortUrl) => {
            if (err) {
                resolve(results);
                return;
            }
            urlCache.set(url, shortUrl);
            resolve(_.merge(results, {
                shortUrl
            }));
        });
    });

    // Get the title
    const getTitle = (url, results) => new Promise((resolve, reject) => {
        xray(url, 'title')((err, title) => {
            if (err || !title) {
                resolve(results);
                return;
            }
            resolve(_.merge(results, {
                title: helpers.StripNewLine(_.trim(title))
            }));
        });
    });

    // Get the youtube key from link
    const getYoutube = (url, key, results) => new Promise((resolve, reject) => {

        // Bail if we have no result
        if (!key || _.isEmpty(key)) {
            resolve(results);
            return;
        }
        return rp({
                uri: 'https://www.googleapis.com/youtube/v3/videos',
                qs: {
                    id: key,
                    key: app.Config.apiKeys.google,
                    fields: 'items(id,snippet(channelId,title,categoryId),statistics)',
                    part: 'snippet,statistics'
                }
            })
            .then(result => {
                let data = JSON.parse(result).items[0];
                // We have no data, default back to the original title grabber
                if (!data) {
                    return getTitle(url, results)
                }
                let videoTitle = data.snippet.title || '';
                let viewCount = data.statistics.viewCount || 0;
                let likeCount = data.statistics.likeCount || 0;
                let dislikeCount = data.statistics.dislikeCount || 0;
                let commentCount = data.statistics.commentCount || 0;
                resolve(_.merge(results, {
                    youTube: {
                        videoTitle,
                        viewCount,
                        likeCount,
                        dislikeCount,
                        commentCount
                    }
                }));
            });
    });

    // Formatting Helper
    const shortSay = (to, from, payload) => {
        let shortString = c.bold('Short:');
        let titleString = c.bold('Info:');
        let output = '';
        let space = () => output == '' ? '' : ' ';

        // We have a Short URL
        if (payload.shortUrl && payload.url.length > app.Config.features.urls.titleMin) {
            output = output + `${shortString} ${c.grey(payload.shortUrl)}`;
        }
        // We have a Title
        if (payload.title && payload.title != '') {
            output = output + space() + `${titleString} ${c.olive(payload.title)}`;
        }
        // We have a YouTube video response
        if (payload.youTube) {
            let yr = payload.youTube;
            output = output + space() + `${c.grey.bold('You')}${c.red.bold('Tube')} ${yr.videoTitle} ${c.navy.bold('⚘')} ` +
                `${c.navy(yr.viewCount)} ${c.green.bold('↑')} ${c.green(yr.likeCount)} ${c.red.bold('↓')} ${c.red(yr.dislikeCount)}` +
                ` ${c.blue.bold('✍')} ${c.blue(yr.commentCount)}`;
        }
        if (output != '') {
            app.say(to, `(${from}) ` + output);
        }
    };

    // Report back to IRC
    const say = (to, from, results) =>
        new Promise((resolve, reject) => {
            if (!_.includes(announceIgnore, to)) {
                shortSay(to, from, results);
                results.delivered.push({
                    protocol: 'irc',
                    to: to,
                    on: Date.now()
                });
            }
            resolve(results);
        });

    // Handle Errors
    const handleErrors = err => {
        if (err.message || err.inner) {
            console.log(err.message, err.inner);
        }
    };

    // Handler
    const listener = (to, from, text, message) => {
        // Check to see if the user is ignored from url listening, good for bots that repete
        if (_.includes(userIgnore, from)) return;

        // Get Urls
        let urls = helpers.ExtractUrls(text);

        // Input does not contain urls
        if (!urls) return;

        _(urls)
            .filter(url => !url.startsWith('ftp'))
            .each(url =>
                startChain(url)
                // Process
                .then(results => shorten(url, results))
                .then(results => {
                    // check for youTube
                    let match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
                    // If We have a valid Youtube Link
                    if (match && match[2].length == 11) {
                        return getYoutube(url, match[2], results);
                    }
                    // If we have a regular link
                    return getTitle(url, results)
                })
                .then(results => say(to, from, results))
                // Report
                .then(results => logInDb(url, to, from, message, results))
                .then(results => pusher(url, to, from, results))
                .catch(handleErrors)
            );
    };

    // URL Info
    const urlInfo = (to, from, text, message) => {};

    // List for urls
    app.Listeners.set('url-listener', {
        desc: 'Listen for URLS',
        call: listener
    });

    // Clear cache every hour
    app.schedule('cleanUrls', cronTime, () => {
        conLogger('Clearing Google Short URL Cache', 'info');
        urlCache.clear();
    });


    // Return the script info
    return scriptInfo;
};
