'use static';
const scriptInfo = {
  name: 'watchYoutube',
  desc: 'watchYoutube module',
  createdBy: 'IronY'
};

const _ = require('lodash');

module.exports = app => {
  // No SocketIO detected
  if (!app.WebServer.socketIO) return scriptInfo;

  // Name of SocketIO namespace
  const namespace = '/youtube';

  // Name of SocketIO Room
  const room = 'watching';

  // Decorate a channel name to avoid collisions
  const activeChannelFormat = chanName => chanName !== null ? `/${chanName.toLowerCase()}` : '/';

  // Join the namespace
  const socket = app.WebServer.socketIO.of(namespace);

  // Attach a listener to on connection
  socket.removeAllListeners('connection');

  socket.on('connection', connection => {
    // Decorate the active channel name to avoid collisions
    const activeChannel = activeChannelFormat(connection.handshake.query.activeChannel);

    // Get Channel Stats
    const channelStats = () => Object.assign({}, {
      totalListeners: socket.adapter.rooms[room].length,
      channelListeners: socket.adapter.rooms[activeChannel].length
    });

    // Send Initial HR Time
    socket.to(connection.id).emit('timesync', Date.now());

    // Join the room
    connection.join(room);

    // Join the active channel
    connection.join(activeChannel);

    // // Listen for any reponses
    connection.removeAllListeners('new-reply');
    connection.on('new-reply', data => socket.to(activeChannel).emit('queue', data));

    // Like
    connection.removeAllListeners('like');
    connection.on('like', () => socket.to(activeChannel).emit('like'));

    // Listen for Disconnects
    connection.removeAllListeners('disconnect');
    connection.on('disconnect', disconnect => socket.to(activeChannel).emit('left', channelStats()));

    // emit new connection event to the rest of the room
    socket.to(activeChannel).emit('new', channelStats());
  });

  // Get total Listeners (Identified)
  app.Commands.set('tv-watchers', {
    desc: '[channel?] Get the number of all watchers of the youtube stream',
    access: app.Config.accessLevels.identified,
    call: (to, from, text, message) => {
      let channel = text.split(' ')[0];
      let count = channel ? getChannelListenersOnActive(channel) : getTotalListeners();
      app.say(to, `${count} connections are viewing the${channel ? ' ' + channel : ''} stream`);
    }
  });

  // TV Administration Command
  app.Commands.set('tv-admin', {
    desc: 'TV Administration',
    access: app.Config.accessLevels.admin,
    call: (to, from, text, message) => {
      // Parse the args
      let args = text.split(' ');

      // No Args Provided
      if (!args.length) {
        app.say(to, 'Subcommand required, use help for more information');
        return;
      }

      // A list of available commands
      const cmds = {
        help: "Get Subcommand usage",
        clear: "<channel?> -- Force of a clear of all connected clients queues",
        reload: "<channel?> -- Force all clients to reload",
        remove: "<channel> <index> -- Remove a index from all connected clients queues",
        speak: "<channel> <message> -- Speak (or display if speak is not available) a message"
      };

      // Switch on the command
      switch (args[0]) {
        // Usage Information
        case 'help':
          _(cmds).each((v, k) => app.say(to, `${k}: ${v}`));
          break;
          // Clear a queue
        case 'clear':
          socket.to(activeChannelFormat(args[1] || to)).emit('control', {
            command: 'clear'
          });
          app.say(to, `The queue for ${args[1] || to} has been cleared`);
          break;
          // Remove an item from the queue index
        case 'speak':
          if (!args[1] || !args[2]) {
            app.say(to, `A Channel and Message is required when speaking`);
            return;
          }
          let tmpArray = args.slice();
          tmpArray.shift();
          tmpArray.shift();
          socket.to(activeChannelFormat(args[1])).emit('control', {
            command: 'speak',
            message: args.join(' '),
          });
          break;
        case 'remove':
          // No channel / Index given
          if (!args[1] || !args[2]) {
            app.say(to, `A Channel and Index is required when removing a queue item`);
            return;
          }
          // Send event
          socket.to(activeChannelFormat(args[1])).emit('control', {
            command: 'remove',
            index: args[2],
          });
          // Report Back
          app.say(to, `The TV Queue item ${args[2]} has been broadcast for deletion on ${args[1]}`);
          break;
          // Force The Client to reload
        case 'reload':
          socket.to(activeChannelFormat(args[1] || to)).emit('control', {
            command: 'reload',
          });
          app.say(to, `Clients on ${args[1] || to} have been Refreshed`);
          break;
        default:
          app.say(to, `Subcommand not found, available commands are ${Object.keys(cmds).join(', ')}`);
          break;
      }

    }
  });

  // Return the script info
  return scriptInfo;
};
