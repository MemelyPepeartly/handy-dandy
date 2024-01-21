const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const package = require('./package.json'); // Load package.json

module.exports = {
  mode: 'development',
  entry: './src/scripts/main.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/module.json',
          to: '',
          transform(content) {
            return content.toString().replace(/<%= id %>/g, package.name)
                                      .replace(/<%= version %>/g, package.version);
          }
        },
        { from: 'src/assets', to: 'assets' }, // Copy the entire assets folder
        { from: 'src/templates', to: 'templates' }, // Copy the entire templates folder
        { from: 'src/styles', to: 'styles' } // Copy the entire packs folder
      ]
    })
  ]
};
