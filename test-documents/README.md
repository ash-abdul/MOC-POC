# Test documents for the spare children

Synthetic files for testing document upload in the portal. Every file is watermarked
**SYNTHETIC TEST DOCUMENT – NOT VALID** and uses placeholder issuers; none relates to a real person.
Regenerate them (for example to refresh the utility bill date) with:

```bash
npm run test-docs
```

## How to use

1. Sign in as a parent (e.g. Fatima Al Mansoori `784-1990-1234567-1`) and set the home location.
2. **Add child** with one of the Emirates IDs below. For non-UAE children enter the passport number
   printed on `child-passport.pdf`.
3. Apply, choose the pathway in the table, and upload the files from the child's folder on the
   **Documents** step. Family documents come from `_family-and-residence/` (parents in the seeded
   families already have these on file and they are reused automatically).

## Children

| Emirates ID | Child | Pathway to choose | Files in the child's folder |
|---|---|---|---|
| 784-2023-9100001-1 | Shamma Khalid Al Nuaimi | New to school (KG1) | Emirates ID, birth certificate, photo, vaccination record |
| 784-2023-9100002-2 | Hamad Saeed Al Kaabi | New to school (KG1) | same as above |
| 784-2023-9100003-3 | Lina Karim Haddad | New to school (KG1), non-UAE | + passport |
| 784-2022-9100004-4 | Zayed Majid Al Dhaheri | New to school (KG2) | Emirates ID, birth certificate, photo, vaccination record |
| 784-2022-9100010-0 | Saif Juma Al Mheiri | New to school (KG2), tick *student of determination* | + student of determination reports |
| 784-2021-9100005-5 | Mariam Adel Saleh | New to school (Grade 1), non-UAE | + passport |
| 784-2019-9100006-6 | Rashid Hamdan Al Shamsi | From a UAE private school, last completed Grade 2 | + school reports, transfer certificate |
| 784-2017-9100007-7 | Maitha Sultan Al Falasi | From a UAE private school, last completed Grade 4 | + school reports, transfer certificate |
| 784-2016-9100008-8 | Omar Tariq Ibrahim | From outside the UAE, last completed Grade 5, non-UAE | + passport, school reports, attested transfer certificate, equivalency certificate |
| 784-2013-9100009-9 | Noura Ali Al Mazrouei | From an MoE school in another emirate, last completed Grade 8 | Emirates ID only (records come from SIS) |

Each photo is provided as both `child-photo.png` and `child-photo.jpg`, so both image formats can be tested.

## Family and residence documents (`_family-and-residence/`)

| File | Use | What to type in the upload form |
|---|---|---|
| `guardian-emirates-id.pdf` | Guardian Emirates ID | – |
| `guardian-passport.pdf` | Non-UAE guardians | – |
| `tenancy-contract.pdf` | Tenancy contract or title deed | Contract number **TC-2026-104523**, expiry **2027-12-31** |
| `utility-bill.pdf` | Utility bill (last 3 months) | Account number **UTIL-4418290**, issue date as printed on the bill |
| `custody-order.pdf` | Sole custody families | – |
| `host-residence-documents.pdf` | "Living with relatives / employer housing" route | – |
| `exceptional-transfer-support-letter.pdf` | Transfer outside the transfer window | – |

The utility bill is dated 20 days before the day it was generated; after about three months it no
longer passes rule BR-10 – run `npm run test-docs` again.

## Files that should be refused (`_invalid-for-testing/`)

| File | Expected result |
|---|---|
| `old-utility-bill.pdf` with the issue date printed on it | Refused: older than 3 months (BR-10) |
| `wrong-format.docx` | Refused: only PDF, JPG and PNG are accepted |
| `oversized-6mb.pdf` (created by `npm run test-docs`, not stored in git) | Refused: larger than 5 MB |

The portal checks file type, size, dates and numbers you enter; it does not read the content of the files.
