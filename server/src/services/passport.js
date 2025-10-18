import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";

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
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const picture = profile.photos?.[0]?.value;

        if (!email) return done(null, false, { message: "Email not found" });

        // ✅ Just pass the Google profile data, DON'T create user here
        // Let the callback route handle user creation with proper domain checks
        return done(null, { email, name, picture });
      } catch (err) {
        console.error("GoogleStrategy error:", err.message);
        return done(err, null);
      }
    }
  )
);
