import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import { pool } from "../db/pool.js";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_, __, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const picture = profile.photos?.[0]?.value;
        const domain = email.split("@")[1];

        // only allow nitw.ac.in domain
        if (!domain.includes("nitw.ac.in"))
          return done(null, false, { message: "Unauthorized domain" });

        const result = await pool.query(
          "SELECT * FROM users WHERE email=$1",
          [email]
        );

        let user;
        if (result.rows.length) {
          user = result.rows[0];
          await pool.query("UPDATE users SET last_login_at=now() WHERE id=$1", [user.id]);
        } else {
          const inserted = await pool.query(
            "INSERT INTO users (email, name, picture, role) VALUES ($1,$2,$3,'user') RETURNING *",
            [email, name, picture]
          );
          user = inserted.rows[0];
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);
