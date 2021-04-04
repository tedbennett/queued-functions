const router = require('express').Router();
const aws = require('aws-sdk');

aws.config.region = 'eu-west-1';

require('dotenv').config();

router.get('/sign-s3', (req, res) => {
  const s3 = new aws.S3();
  const { id } = req.query;
  if (id === undefined) {
    res.send(404);
    return;
  }
  const fileType = req.query['file-type'];
  const s3Params = {
    Bucket: process.env.S3_BUCKET,
    Key: id,
    Expires: 60,
    ContentType: fileType,
    ACL: 'public-read',
  };

  s3.getSignedUrl('putObject', s3Params, (err, data, next) => {
    if (err) {
      console.log(err);
      next(err);
    }
    const returnData = {
      signedRequest: data,
      url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${id}`,
    };
    res.json(returnData);
    res.end();
  });
});

module.exports = router;
