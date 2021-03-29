const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('delete-facebook-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API delete-facebook-integration called successfully',
    },
  };
};
