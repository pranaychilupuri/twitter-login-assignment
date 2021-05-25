const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

let userId = async (request, response, next) => {
  const getUserId = `SELECT user_id FROM user WHERE username LIKE '${request.username}'`;
  const dbUserId = await db.get(getUserId);
  let userId;
  if (dbUserId !== undefined) {
    request.userId = dbUserId.user_id;
    next();
  } else {
    request.username = payload.username;
    next();
  }
};

//Create User API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, password, name, gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}'
      );`;
    if (validatePassword(password)) {
      const dbResponse = await db.run(createUserQuery);
      const user_id = dbResponse.lastID;
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login User API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/", async (request, response) => {
  const getUserQuery = `
    SELECT *
    FROM like;`;
  const userArray = await db.all(getUserQuery);
  response.send(userArray);
});

//User Tweet API

app.get(
  "/user/tweets/feed/",
  authenticateToken,
  userId,
  async (request, response) => {
    const userId = request.userId;
    const getUserQuery = `
    SELECT
        username, tweet, date_time AS dateTime
    FROM 
        user NATURAL JOIN tweet
    WHERE 
        user_id IN (
            SELECT
                following_user_id
            FROM
                follower
            WHERE
                follower_user_id = ${userId}
        )
    ORDER BY
        dateTime DESC
    LIMIT 4;`;
    const userArray = await db.all(getUserQuery);
    response.send(userArray);
  }
);

app.get("/following/", async (request, response) => {
  const getUserQuery = `
    SELECT *
    FROM follower;`;
  const userArray = await db.all(getUserQuery);
  response.send(userArray);
});

//User Following API

app.get(
  "/user/following/",
  authenticateToken,
  userId,
  async (request, response) => {
    const userId = request.userId;
    const getUserFollowingQuery = `
    SELECT
        name
    FROM 
        user 
    WHERE
        user_id IN (
            SELECT
                following_user_id
            FROM
                follower
            WHERE
                follower_user_id = ${userId}
        );`;
    const userArray = await db.all(getUserFollowingQuery);
    response.send(userArray);
  }
);

//User Followers API

app.get(
  "/user/followers/",
  authenticateToken,
  userId,
  async (request, response) => {
    const userId = request.userId;
    const getUserFollowerQuery = `
    SELECT
        name
    FROM 
        user 
     WHERE
        user_id IN (
            SELECT
                follower_user_id
            FROM
                follower
            WHERE
                following_user_id = ${userId}
        );`;
    const userArray = await db.all(getUserFollowerQuery);
    response.send(userArray);
  }
);

//Tweet TweetId API

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  userId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;
    const validate = `
    SELECT tweet from tweet WHERE user_id = ${userId} and tweet_id = ${tweetId}`;
    const dbResponse = await db.get(validate);

    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const tweetQuery = `
    SELECT
        tweet,
        count(DISTINCT like_id) AS likes,
        count(DISTINCT reply_id) AS replies,
        date_time AS dateTime
    FROM
    (
        tweet
        LEFT JOIN LIKE ON tweet.tweet_id = LIKE.tweet_id
    ) AS T
        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId};
    `;

      const responseArray = await db.get(tweetQuery);
      response.send(responseArray);
    }
  }
);

//Tweet TweetID Likes API

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  userId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;
    const validate = `
    SELECT 
        tweet
    FROM 
        tweet
    WHERE 
        user_id = ${userId} and tweet_id = ${tweetId};`;
    const dbResponse = await db.get(validate);

    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesQuery = `
        SELECT
            name
        FROM
            LIKE
                LEFT JOIN user ON LIKE.user_id = user.user_id
        WHERE
            tweet_id = ${tweetId};`;
      const likeResponse = await db.all(likesQuery);
      response.send({ likes: likeResponse.map((each) => each.name) });
    }
  }
);

//Tweet TweetId Reply API

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  userId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;
    const validate = `
        SELECT 
            tweet 
        FROM 
            tweet 
        WHERE 
            user_id = ${userId} and tweet_id = ${tweetId};`;
    const dbResponse = await db.get(validate);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const replyQuery = `
        SELECT
            name, reply
        FROM
            reply LEFT JOIN user ON reply.user_id = user.user_id
        WHERE
            tweet_id =${tweetId}
      ;`;
      const replyResponse = await db.all(replyQuery);
      response.send({
        replies: replyResponse.map((each) => ({
          name: each.name,
          reply: each.reply,
        })),
      });
    }
  }
);

//User Tweet API

app.get(
  "/user/tweets/",
  authenticateToken,
  userId,
  async (request, response) => {
    const userId = request.userId;
    const getUserTweetQuery = `
    SELECT
        tweet, 
        COUNT(DISTINCT like_id) AS likes, 
        COUNT(DISTINCT reply_id) AS replies, 
        date_time AS dateTime
    FROM 
        (tweet LEFT JOIN like ON tweet.tweet_id = LIKE.tweet_id) AS T
        LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE
        tweet.user_id = ${userId}
    GROUP BY 
        tweet.tweet_id;`;
    const userTweetArray = await db.all(getUserTweetQuery);
    response.send(userTweetArray);
  }
);

//Tweet TweetId API

app.post(
  "/user/tweets/",
  authenticateToken,
  userId,
  async (request, response) => {
    const { tweet } = request.body;
    const userId = request.userId;
    const userPostQuery = `
    INSERT INTO
    tweet ( tweet, user_id)
  VALUES
    ('${tweet}', ${userId});`;
    const tweetResponse = await db.run(userPostQuery);
    const tweet_id = tweetResponse.lastID;
    response.send("Created a Tweet");
  }
);

//Delete Tweet API

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  userId,
  async (request, response) => {
    const { tweetId } = request.params;
    const userId = request.userId;
    const deleteTweet = ` SELECT tweet FROM tweet WHERE tweet_id = ${tweetId} and user_id = ${userId};`;
    const delResponse = await db.run(deleteTweet);
    if (delResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
            DELETE FROM tweet
            WHERE tweet_id = ${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
