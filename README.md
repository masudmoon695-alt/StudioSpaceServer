# StudioSpace Server

Express and MongoDB backend for **StudioSpace**, a marketplace where hosts list creative studios and customers search, book, and review them.

> This repository contains the API only. The client application lives separately.

**Live API:** [studiospaceserver-five.vercel.app](https://studiospaceserver-five.vercel.app)
**Health check:** `GET /api/health`

---

## Features

- **Authentication**: email/password registration and login, plus Google OAuth sign-in
- **Secure sessions**: signed JWT stored in an HTTP-only cookie (`studio_space_token`); passwords are hashed before storage
- **Studio listings**: create, update, delete, and browse studios with search, filtering, sorting, and pagination
- **Bookings**: request a booking, with confirmed time overlaps rejected; hosts can confirm, cancel, or complete bookings
- **Reviews**: one review per user per studio, with the studio's `rating` and `reviewCount` updated automatically
- **Image uploads**: authenticated JPEG, PNG, and WebP uploads (max 5 MB) via ImgBB
- **Ownership enforced server-side**: studio and booking ownership comes from the verified cookie, never from client-supplied owner or customer fields
- **Vercel-ready**: deployment config included via `vercel.json`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ |
| Framework | Express |
| Database | MongoDB |
| Auth | JWT (HTTP-only cookie), Google OAuth |
| Image hosting | ImgBB |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 20 or newer
- A MongoDB database (local or Atlas)
- Google OAuth credentials (only if you need Google sign-in)
- An ImgBB API key (only if you need image uploads)

### Installation

```bash
git clone https://github.com/masudmoon695-alt/StudioSpaceServer.git
cd StudioSpaceServer
npm install
```

### Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in the values (see [Environment Variables](#environment-variables)). At minimum you need `MONGODB_URI` and a long, random `BETTER_AUTH_SECRET`.
3. For Google sign-in, register the exact `GOOGLE_CALLBACK_URL` as an authorized redirect URI in your Google Cloud OAuth client.
4. Set `CLIENT_URL` and `CORS_ORIGINS` to your client origin(s). Credentialed requests must send cookies and come from an allowed origin.

### Run

```bash
npm run dev   # development
npm start     # production
```

The server listens on port `8000` by default. Verify it is up:

```bash
curl http://localhost:8000/api/health
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DATABASE` | No | Database name (default: `studio_space`) |
| `PORT` | No | HTTP port (default: `8000`) |
| `BETTER_AUTH_SECRET` | Yes | Signing secret; also used for JWT unless `JWT_SECRET` is set |
| `JWT_SECRET` | No | Dedicated signing secret for the HTTP-only auth cookie |
| `BETTER_AUTH_URL` | No | Frontend/auth application URL; used as the client URL fallback |
| `API_URL` | No | Public base URL of this API, used to build the Google callback URL (default: localhost and `PORT`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | No | Explicit Google OAuth callback URL |
| `IMGBB_API_KEY` | For uploads | ImgBB API key for the image-upload endpoint |
| `CLIENT_URL` | No | Client origin used after Google sign-in (default: `BETTER_AUTH_URL` or `http://localhost:3000`) |
| `CORS_ORIGINS` | No | Comma-separated additional allowed origins |

> Never commit `.env`. `.env.example` contains placeholders only.

## API Reference

All responses are JSON, except the Google OAuth redirects. Authenticated endpoints read the `studio_space_token` HTTP-only cookie.

### Auth

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| `POST` | `/api/auth/register` | Public | Create an account |
| `POST` | `/api/auth/login` | Public | Sign in and set the auth cookie |
| `POST` | `/api/auth/logout` | Public | Clear the auth cookie |
| `GET` | `/api/auth/me` | Authenticated | Get the current user |
| `GET` | `/api/auth/google` | Public | Start Google sign-in |
| `GET` | `/api/auth/google/callback` | OAuth callback | Finish Google sign-in |

### Studios

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| `GET` | `/api/studios` | Public | Search and filter studios |
| `GET` | `/api/studios/featured` | Public | Get up to six featured studios |
| `GET` | `/api/studios/mine` | Authenticated | List the signed-in host's studios |
| `GET` | `/api/my-studios` | Authenticated | Dashboard alias for `/api/studios/mine` |
| `GET` | `/api/studios/:id` | Public | Get studio details |
| `POST` | `/api/studios` | Authenticated | Create a studio for the signed-in host |
| `PATCH` | `/api/studios/:id` | Owner | Update editable studio fields |
| `DELETE` | `/api/studios/:id` | Owner | Delete a studio |

`GET /api/studios` query parameters: `page`, `limit`, `category`, `location`, `search`, `minPrice`, `maxPrice`, `sort`.

### Bookings

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| `POST` | `/api/bookings` | Authenticated | Request a booking (confirmed time overlaps are rejected) |
| `GET` | `/api/bookings/mine` | Authenticated | List the signed-in user's bookings |
| `GET` | `/api/bookings/my` | Authenticated | Dashboard alias for `/api/bookings/mine` |
| `GET` | `/api/bookings/host` | Authenticated | List bookings for the signed-in host's studios |
| `PATCH` | `/api/bookings/:id/cancel` | Booking owner | Cancel a pending booking |
| `PATCH` | `/api/bookings/:id/status` | Studio host | Confirm, cancel, or complete a booking |

### Reviews

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| `POST` | `/api/reviews` | Authenticated | Create one review per user per studio; updates the studio's `rating` and `reviewCount` |
| `GET` | `/api/reviews?studioId=<id>` | Public | List reviews for a studio, newest first |
| `GET` | `/api/reviews/:id` | Public | Get a single review |

### Uploads

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| `POST` | `/api/uploads/images` | Authenticated | Upload a JPEG, PNG, or WebP image to ImgBB (`multipart/form-data`, field `image`, max 5 MB) |

## Project Structure

```
StudioSpaceServer/
├── api/            # Vercel serverless entry
├── src/            # Application source
├── test/           # Tests
├── index.js        # Server entry point
├── vercel.json     # Vercel deployment config
├── .env.example    # Environment variable template
└── package.json
```

## Deployment

The project is configured for Vercel through `vercel.json`. When deploying:

1. Add all required [environment variables](#environment-variables) in the Vercel project settings.
2. Set `API_URL` to your deployed API URL and update `GOOGLE_CALLBACK_URL` (and the Google Cloud redirect URI) to match.
3. Add your deployed client origin to `CLIENT_URL` and `CORS_ORIGINS`.

## Security Notes

- Auth tokens live in an HTTP-only cookie, so they are not readable from client-side JavaScript.
- Passwords are hashed before they are stored.
- Email verification and password reset are intentionally not implemented.

## Author

**Masud Moon**, CSE student at ULAB
GitHub: [@masudmoon695-alt](https://github.com/masudmoon695-alt)
