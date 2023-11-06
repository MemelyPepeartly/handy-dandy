const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const packageJson = require('./package.json');

module.exports = {
  entry: './src/scripts/index.ts', // entry point file
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    // Clean the dist folder before each build
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: ['**/*'], // This will remove all files from dist folder before each build
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'src/module.json',
          to: '../module.json',
          transform: (content) => {
            // Replace placeholders in module.json content
            const jsonContent = JSON.parse(content.toString());
            jsonContent.id = packageJson.name;
            jsonContent.title = 'Handy Dandy';
            jsonContent.version = packageJson.version;
            return JSON.stringify(jsonContent, null, 2);
          },
        },
        // Copy .hbs files to ./templates directory
        {
          from: 'src/templates',
          to: '../templates'
        },
        // Copy styles files to ./styles directory
        {
          from: 'src/styles',
          to: '../styles'
        },
        // Copy asset files to ./assets directory
        {
          from: 'src/assets',
          to: '../assets'
        }
      ],
    }),
  ],
  output: {
    filename: 'bundle.js', // Output bundle file name
    path: path.resolve(__dirname, 'dist', 'scripts'), // Output directory
  },
};
