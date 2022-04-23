import TwitterApi from 'twitter-api-v2';

const getUser = (twitter, userId) => {
  return twitter.v2.user(userId);
};

const getSpacesByUserId = (twitter, userId) => {
  return twitter.v2.spacesByCreators(userId);
};

export const getTwitter = bearerToken => {
  const twitter = new TwitterApi.TwitterApi(bearerToken);
  twitter.getUser = (...args) => getUser(twitter, ...args);
  twitter.getSpacesByUserId = (...args) => getSpacesByUserId(twitter, ...args);
  return twitter;
}

