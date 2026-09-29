# CQG WebAPI access request for Count Desk

Status: draft for Mark's review. No request has been submitted. An ordinary AMP/CQG platform login does not supply a CQG WebAPI client application ID or grant custom-app access. CQG currently describes WebAPI as an Enterprise API and its individual Client API as requiring CQG Integrated Client; ask CQG to confirm whether a single-user WebAPI exception or another affordable approved feed is available before applying for paid service.

## Application form entries

- Applicant: Individual
- API use: Market Data Only
- Internal users: 1
- External users: 0
- Application: Count Desk, a local single-user futures chart and paper simulation interface
- Initial market: CBOT Micro E-mini Dow (MYM), using exact dated contracts
- Data requested: symbol metadata, historical time bars, and streaming time bars if allowed
- Trading: no live order routing in the initial application
- Distribution: no resale or redistribution
- Storage and derived analysis: ask CQG and AMP for explicit permission to retain bars locally and compute chart indicators, Elliott Wave research overlays, and paper fills

## Text to send to CQG / AMP

> I am an individual AMP Futures customer using CQG market data for MYM. I am building a local, single-user chart and paper trading application called Count Desk. I need real-time CBOT MYM data in my own local chart and paper simulation. Is a single-user, market-data-only WebAPI integration available to an individual AMP customer, or is there another approved, affordable way to use my existing CQG entitlement in this application? Please provide the complete monthly and one-time costs before enrollment. Can I use my existing AMP/CQG username and password after app approval, or is a separate user needed? If WebAPI is available, I need an assigned Client App ID and Private Label, the correct demo and production login process, any IP allowlisting, and the conformance path. Please specify whether one concurrent platform session is allowed or whether a separate CQG user/data subscription is required. Please confirm the permitted display, local bar retention, indicator/count calculation, and paper simulation uses, including any retention limit. I am not requesting live order routing at this stage.

The [CQG API Information Request form](https://www.cqg.com/products/cqg-apis/cqg-api-information-request) supplies Individual and Market Data Only choices. CQG lists [WebAPI pricing as contact us](https://partners.cqg.com/marketing-resources/monthly-price-sheet), classifies [WebAPI as an Enterprise API](https://www.cqg.com/products/cqg-apis), and says its [individual Client API requires CQG Integrated Client](https://www.cqg.com/products/cqg-apis/client-apis). The [WebAPI documentation](https://help.cqg.com/apihelp/Documents/cqgwebapi.htm) describes assigned client identifiers and production conformance. CQG's [demo credential procedure](https://help.cqg.com/apihelp/Documents/messageobtaindemocredentials.htm) requires an approved IP address.

## Local connector state

`count-dashboard/cqg_webapi.py probe-network` confirms the CQG demo WebSocket can be reached. That is not authentication, entitlement, or a price feed. `probe-login` awaits CQG-issued WebAPI credentials. The Count Desk source remains **API access required** until the access and data-use gates are satisfied.

The connector is read-only. It requests symbol metadata and completed historical time bars for a configured exact dated MYM contract. It does not expose order or account requests. Its loopback `/sync` endpoint refuses demo data and requires explicit access and data-use flags; CQG demo data must stay in an isolated test environment.
