const path = require('path');

const config = {
  entry: {
    'main': [
      './src/entry.js'
    ]
  },
  devtool: 'source-map',
  output: {
    path: path.join(process.cwd(), 'dist/'),
    filename: 'okuma_love.cps'
  },
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader'
    }]
  }
};

module.exports = config;
