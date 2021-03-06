'use strict';
var Models = require('bookshelf-model-loader');

var Url = Models.Base.extend({
    tableName: 'url',
    hasTimestamps: ['timestamp'],
    soft: false
});

module.exports = {
    Url: Models.Bookshelf.model('url', Url)
};
