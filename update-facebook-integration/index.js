const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('update-facebook-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API update-facebook-integration called successfully',
    },
  };
};
