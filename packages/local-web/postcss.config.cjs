const path = require('path');

module.exports = {
  plugins: {
    tailwindcss: {
      config: path.resolve(__dirname, 'tailwind.new.config.js'),
    },
    autoprefixer: {},
  },
};
