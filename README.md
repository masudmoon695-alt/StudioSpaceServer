# StudioSpace Server

Express and MongoDB backend for the StudioSpace studio marketplace. This repository contains API code only; it does not include or modify the client application.

## Local setup

1. Install Node.js 20 or newer and run `npm install`.
2. Copy `.env.example` to `.env` and set the MongoDB URI, a long authentication secret, and Google OAuth credentials if Google sign-in is needed.
3. In the Google Cloud OAuth client, register the exact `GOOGLE_CALLBACK_URL` as an authorized redirect URI.
4. Start the API with `npm run dev` (or `npm start`); the default port is 8000 and `GET /api/health` is the health check.
5. Set `CLIENT_URL` and `CORS_ORIGINS` to the client origin(s). Credentialed requests must send cookies and use an allowed origin.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (required) |
| `MONGODB_DATABASE` | Database name (defaults to `studio_space`) |
| `PORT` | HTTP port (defaults to `8000`) |
| `BETTER_AUTH_SECRET` | Required signing secret; also used for JWT unless `JWT_SECRET` is set |
| `JWT_SECRET` | Optional dedicated signing secret for the HTTP-only auth cookie |
| `BETTER_AUTH_URL` | Frontend/auth application URL; used as the client URL fallback |
| `API_URL` | Public base URL of this Express API, used to form the Google callback URL (defaults to localhost and `PORT`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | Optional explicit Google OAuth callback URL |
| `IMGBB_API_KEY` | ImgBB API key for the authenticated image-upload endpoint |
| `CLIENT_URL` | Client origin used after Google sign-in; defaults to `BETTER_AUTH_URL` or localhost:3000 |
| `CORS_ORIGINS` | Comma-separated additional allowed origins |

Never commit `.env`; `.env.example` contains placeholders only.

## API

All responses use JSON except the Google OAuth redirects. Authenticated endpoints use the `studio_space_token` HTTP-only cookie; send credentialed requests from an allowed origin.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create an account |
| `POST` | `/api/auth/login` | Public | Sign in and set the auth cookie |
| `POST` | `/api/auth/logout` | Public | Clear the auth cookie |
| `GET` | `/api/auth/me` | Authenticated | Get the current user |
| `GET` | `/api/auth/google` | Public | Start Google sign-in |
| `GET` | `/api/auth/google/callback` | OAuth callback | Finish Google sign-in |
| `GET` | `/api/studios` | Public | Search/filter studios; supports `page`, `limit`, `category`, `location`, `search`, `minPrice`, `maxPrice`, and `sort` |
| `GET` | `/api/studios/featured` | Public | Get up to six featured studios |
| `GET` | `/api/studios/mine` | Authenticated | List the signed-in host's studios |
| `GET` | `/api/my-studios` | Authenticated | Dashboard alias for `/api/studios/mine` |
| `GET` | `/api/studios/:id` | Public | Get studio details |
| `POST` | `/api/studios` | Authenticated | Create a studio for the signed-in host |
| `PATCH` | `/api/studios/:id` | Owner | Update editable studio fields |
| `DELETE` | `/api/studios/:id` | Owner | Delete a studio |
| `POST` | `/api/bookings` | Authenticated | Request a booking; confirmed time overlaps are rejected |
| `GET` | `/api/bookings/mine` | Authenticated | List the signed-in user's bookings |
| `GET` | `/api/bookings/my` | Authenticated | Dashboard alias for `/api/bookings/mine` |
| `GET` | `/api/bookings/host` | Authenticated | List bookings for the signed-in host's studios |
| `PATCH` | `/api/bookings/:id/cancel` | Booking owner | Cancel a pending booking |
| `PATCH` | `/api/bookings/:id/status` | Studio host | Confirm, cancel, or complete a booking |
| `POST` | `/api/reviews` | Authenticated | Create one review per user per studio; updates the studio's `rating` and `reviewCount` |
| `GET` | `/api/reviews?studioId=<id>` | Public | List reviews for a studio, newest first |
| `GET` | `/api/reviews/:id` | Public | Get a single review |
| `POST` | `/api/uploads/images` | Authenticated | Upload a JPEG, PNG, or WebP image to ImgBB (`multipart/form-data`, field `image`, max 5 MB) |

Studio and booking ownership is derived from the verified cookie, not from client-supplied owner or customer fields. Passwords are hashed before storage. Email verification and password reset are intentionally not implemented.
