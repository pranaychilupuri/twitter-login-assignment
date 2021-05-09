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
      await db.run(createUserQuery);
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

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getUserQuery = `
    SELECT
        username, tweet, date_time AS dateTime
    FROM 
        user INNER JOIN tweet ON user.user_id = tweet.user_id
    ORDER BY
        dateTime DESC
    LIMIT 4;`;
  const userArray = await db.all(getUserQuery);
  response.send(userArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getUserFollowingQuery = `
    SELECT
        name
    FROM 
        user INNER JOIN follower ON user.user_id = follower.following_user_id
    GROUP BY name;`;
  const userFollowingArray = await db.all(getUserFollowingQuery);
  response.send(userFollowingArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getUserFollowerQuery = `
    SELECT
        name
    FROM 
        user INNER JOIN follower ON user.user_id = follower.follower_user_id
    GROUP BY name;`;
  const userFollowerArray = await db.all(getUserFollowerQuery);
  response.send(userFollowerArray);
});

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getUserTweetQuery = `
    SELECT
        tweet, COUNT(like_id) AS likes, COUNT(reply) AS replies, date_time AS dateTime
    FROM (tweet LEFT JOIN reply ON tweet.user_id = reply.user_id) AS T 
    LEFT JOIN like ON T.user_id = like.user_id
    GROUP BY tweet.user_id;`;
  const userTweetArray = await db.all(getUserTweetQuery);
  response.send(userTweetArray);
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteQuery = ` DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
