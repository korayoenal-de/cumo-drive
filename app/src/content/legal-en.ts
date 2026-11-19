/**
 * English translation of the legal texts (src/content/legal.ts). Launch version of 18 November 2026, written to the best of our knowledge without legal review.
 * The German version prevails. Translated by Claude, not legal advice.
 */
import type { LegalDoc } from './legal';

const CONTACT = 'kontakt@cumodrive.com';
const IMPRINT = 'https://cumodrive.de/impressum';
const STAND = 'As of 19 November 2026. This is a translation; the German version prevails.';

export const PRIVACY_EN: LegalDoc = {
  title: 'Privacy',
  lead:
    'Cumo Drive is a navigation app for sports cars, with an iPhone app, CarPlay and a web planner. This page explains which data is created, why we need it and who gets to see it. In short: we show no ads, sell no data and use no tracking services.',
  stand: STAND,
  blocks: [
    {
      h: '1. Controller',
      p: [
        `The controller is the operator of Cumo Drive, CUMO DRIVERS CLUB, represented by Koray Önal. The full address is in the imprint at ${IMPRINT}.`,
        `For privacy questions, reach us at ${CONTACT}. We have not appointed a data protection officer because we are not required to.`,
      ],
    },
    {
      h: '2. Which data we process',
      list: [
        'Account: email address, password (stored only encrypted), display name under which others invite you to group drives.',
        'Consents: that you accepted the terms of use and acknowledged the privacy policy when registering, each with date and version, and whether you want to receive news by email.',
        'Tours: planned and saved tours with waypoints, line, names and folders, as well as tours you publish in the community.',
        'Drives: when you start navigation, the driven track with time, speed and statistics (kilometres, bends, lateral acceleration) and your rating of the drive with reasons and note.',
        'Use of planning: when you plan a loop, reroll, save, take over, publish, delete or start a tour, we store the line of the tour, its length, the profile and the calculated driving fun score. We cut off the first and last 2 km of the line beforehand so that start and destination, such as your front door, are not included.',
        'Vehicles: details from your garage such as make and model, shape and colour of the vehicle symbol.',
        'Profile and community: profile photo if you set one (scaled down to 512 pixels, accessible to anyone with the link, removable at any time), home town (shown to others only as the town centre, never as an address), the About me text, whether you are visible under Drivers, whether others may message you and whether they can see your garage. In addition private messages, club drives with requests and chat.',
        'Radio in a group drive: your voice only while you hold the radio button. It is transmitted live to the other participants and is not recorded or stored.',
        'Notifications: if you allow them, a device token for push notifications about messages, invitations and requests.',
        'Feedback: when you tap Report a problem, the position, what the app was showing at that moment, the last minutes of the drive and the app version; when you rate a drive poorly, rating, reasons and note; when you send feedback in Settings, area, text and app version. We review every report to fix bugs and improve the app (legitimate interest, Art. 6(1)(f) GDPR) and let you know when your feedback has been implemented.',
        'Error reports: if the app crashes or an error occurs, we send the error message with the place in the program, the app version, the screen and the operating system, together with your account ID if you are signed in. Locations and content are not included. Identical errors are counted together so we can fix them (legitimate interest, Art. 6(1)(f) GDPR).',
        'Location: during planning and navigation, to guide you and to plan loops from your location. In a group drive the other participants see your position live while the drive is running.',
        'Camera and microphone: the camera only to read a QR code from the web planner; we do not store images. The microphone only for the radio, while you hold the button.',
        'Purchase: whether you have a subscription and when it ends. Only Apple sees payment details, we do not.',
        'Technical data: when servers are accessed, IP address, time and device type are processed. We do not use them to build profiles.',
      ],
    },
    {
      h: '3. Purposes and legal basis',
      list: [
        'Providing the app, your account, planning, navigation, group drives and syncing between app and web planer: performance of the contract with you (Art. 6(1)(b) GDPR).',
        'Location: only with your permission on the iPhone, which you can withdraw at any time in Settings. Without location you can still plan, but not navigate.',
        'Improving roads: we evaluate ratings, driven tracks and the use of planning in aggregated form and without reference to you as a person, to improve the driving fun level of roads and the planning (legitimate interest, Art. 6(1)(f) GDPR). A road section is only included once at least three different drivers have used it. Nobody apart from the evaluation sees your individual entries, not even other drivers. You can object at any time at the address above.',
        'Security and abuse protection of the servers: legitimate interest (Art. 6(1)(f) GDPR).',
        'News by email (new features, roads, drives): only if you agree when registering or in Settings and have confirmed your email address (consent, Art. 6(1)(a) GDPR). You can withdraw it at any time in Settings or via the link in every email. We keep your acceptance of the terms and privacy policy as proof for as long as your account exists (Art. 6(1)(c) GDPR).',
        'Statutory retention, for example for club licences invoiced to clubs: legal obligation (Art. 6(1)(c) GDPR).',
      ],
    },
    {
      h: '4. Who receives data',
      p: ['We only pass data to services we need for the respective function. Data processing agreements under Art. 28 GDPR are in place with processors.'],
      list: [
        'Supabase (Supabase Pte. Ltd., Singapore, servers in Frankfurt am Main): account, tours, drives, vehicles, messages, club drives with chat, feedback, error reports, pass status and the real time connection of group drives. Processor; transfers outside the EU are based on standard contractual clauses.',
        'Brevo (Sendinblue SAS, France): sends the email that confirms your email address on our behalf. Your email address, the content of that email and delivery data are transmitted. Processor based in the EU.',
        'Our own routing servers at Contabo (Contabo GmbH, Germany): calculate routes from your waypoints. Processor.',
        'Place search, elevation profile, speed limits and stops along the route are also calculated by our own servers at Contabo. Only if they are unavailable does the app fall back to Photon by komoot (komoot GmbH, Germany) with the search term or coordinate and the Valhalla server of FOSSGIS e.V. (Germany) with the line of the route.',
        'Apple (Apple Distribution International, Ireland, and Apple Inc., USA): App Store, subscriptions, map display with Apple Maps, CarPlay and weather at the passes via WeatherKit. For the weather we send the location of the pass, not your location.',
        'Expo (650 Industries Inc., USA): delivers app updates. IP address and device data are processed. The transfer to the USA is based on the EU US Data Privacy Framework.',
        'TomTom (TomTom International B.V., Netherlands): supplies our server with reports about closed passes and current closures. Our server queries rough map areas for this, no data about you.',
        'LiveKit (LiveKit Inc., USA, servers in Frankfurt am Main): transmits the radio in a group drive live between participants, without recording. Your display name, an identifier and your voice while you speak are transmitted. Processor; a transfer to the USA is based on standard contractual clauses.',
        'Push notifications via Expo (650 Industries Inc., USA) and the Apple Push service: title, short text and device token of the notification.',
        'Membership purchases: Apple handles the payment, we receive no payment details. RevenueCat (RevenueCat Inc., USA) manages the purchases for us and reports them to our server. Transmitted are your account identifier, the products bought, times and device data from the App Store. Processor; the basis for the transfer to the USA is the EU US Data Privacy Framework.',
        'In the web planner additionally: OpenFreeMap for the map tiles. We deliver the map library and fonts from our own domain, without Google Fonts or third party CDNs.',
        'Other drivers: in a group drive your display name, vehicle, live position and, on the radio, your voice, only for the duration of the drive. In the community your display name, your profile photo and the published tour; under Drivers (can be switched off) name, town centre, About me and, if you wish, your garage. Private messages are seen only by the recipient; if someone reports a message, we see a copy of it for review.',
      ],
    },
    {
      h: '5. How long we store data',
      list: [
        'Account, tours, drives and vehicles until you delete them or delete your account.',
        'Entries on the use of planning for at most 24 months; after that only the aggregated values per road section remain.',
        'Feedback, error reports and drive logs from Report a problem for at most 12 months.',
        'Live positions in group drives are not stored, only exchanged between participants during the drive.',
        'Server logs for at most 14 days.',
        'Invoice data for club licences as long as commercial and tax law requires (up to 10 years).',
      ],
    },
    {
      h: '6. Deleting your account',
      p: [
        'You can delete your account at any time in the app under Settings, Account, Delete account. We then delete your account, tours, drives, vehicles, ratings, feedback and the entries on the use of planning. Published community tours disappear as well. Aggregated evaluations without personal reference remain. You cancel a subscription separately in the settings of your Apple ID.',
      ],
    },
    {
      h: '7. On your device',
      p: [
        'The app stores tours, settings (for example map style, voice, speed display, language) and your login on the iPhone. The web planner stores tours and login in the browser. We do not set cookies for advertising or analytics; what we store locally is necessary for the function (Section 25(2) TDDDG).',
      ],
    },
    {
      h: '8. Your rights',
      p: [
        `You have the right of access, rectification, erasure, restriction of processing, data portability and objection (Art. 15 to 21 GDPR). You can withdraw consent at any time with effect for the future. Write to us at ${CONTACT}.`,
        'You can also lodge a complaint with a data protection supervisory authority, for example the Hessian Commissioner for Data Protection and Freedom of Information.',
      ],
    },
    {
      h: '9. No automated decisions',
      p: ['We do not make decisions based solely on automated processing that have legal effect on you.'],
    },
    {
      h: '10. Changes',
      p: ['When we introduce new features, we update this policy. The current version is always available here.'],
    },
  ],
};

export const TERMS_EN: LegalDoc = {
  title: 'Terms',
  headTitle: 'Terms of use',
  lead:
    'General terms and conditions and terms of use. These terms apply to the Cumo Drive app on the iPhone and in CarPlay and to the web planner. For purchases via the App Store, Apple’s standard licence agreement applies in addition. This is a translation; the German version prevails.',
  stand: STAND,
  blocks: [
    {
      h: '1. Provider and scope',
      p: [
        `The provider is the CUMO DRIVERS CLUB, represented by Koray Önal (address in the imprint at ${IMPRINT}, contact ${CONTACT}). These terms apply to all users. Deviating terms of users do not apply.`,
      ],
    },
    {
      h: '2. Service',
      p: [
        'Cumo Drive plans tours for sports cars, checks them against road data (width, surface, closures), announces passes and dream roads, guides you with navigation and connects drivers in group drives. It is based on data from OpenStreetMap, Apple and other services and on our own database of roads and passes.',
        'We develop Cumo Drive continuously. Features may change as long as the core of the service remains. The app may be temporarily limited, for example during maintenance or when third party services fail; it then plans via fallback services with fewer features.',
      ],
    },
    {
      h: '3. Safety first',
      list: [
        'Traffic laws and road signs always take precedence over the app’s instructions, including speed, closures and turn instructions.',
        'Do not operate the app while driving, except via CarPlay or the voice announcements. Plan before the drive or let a passenger plan.',
        'Roads, widths, surface, pass status, weather, speed limits and bend warnings are based on third party data and estimates. They may be wrong, outdated or incomplete. Check closures and weather yourself before driving.',
        'Cumo Drive is not a competition or racing tool. Drive appropriately and within the law.',
      ],
    },
    {
      h: '4. Account',
      p: [
        'The app requires an account with email address and password. You must be at least 16 years old. Keep your password secret. You can delete your account at any time in the app. We may suspend an account that violates these terms, where possible only after a warning.',
      ],
    },
    {
      h: '5. Subscriptions and prices',
      list: [
        'You buy paid plans in the app via Apple. The prices shown in the app before purchase apply, including VAT. Billing is via your Apple ID.',
        'Weekly, monthly and yearly subscriptions renew automatically for the same term unless you cancel in your Apple ID settings at least 24 hours before the end. The Season Pass is valid for the stated period and ends by itself.',
        'If the app offers a free trial, the chosen subscription starts when it ends unless you cancel before.',
        'You conclude the purchase with Apple; Apple is the seller of the subscriptions and the season pass. You therefore exercise any right of withdrawal towards Apple, under Apple’s terms for App Store purchases. You request withdrawal and refunds from Apple at reportaproblem.apple.com.',
        'Club licences and event passes for clubs and organisers are concluded separately and invoiced. Members of a club with a valid licence can use the features without their own subscription while the licence runs.',
      ],
    },
    {
      h: '6. Our content and data',
      list: [
        'The app, the web planner and our content, in particular the databases we compiled on passes, roads, highlights and tours with ratings, descriptions and announcements, and the routing profiles, are protected by copyright and as a database under Sections 87a et seq. of the German Copyright Act (UrhG).',
        'You may use them for your own private purposes in the app and web planner. Club licences entitle use for the club’s drives.',
        'Not permitted are: systematic or automated reading and storing (scraping, bots, non public interfaces), copying or distributing substantial parts of the databases, using them to build or train a competing service or AI model, and circumventing technical protection measures, unless the law allows it.',
        'GPX and KML export are for personal use, for example in a navigation device. Commercial distribution of exported tours requires our consent.',
        'Map data partly comes from OpenStreetMap (© OpenStreetMap contributors, licence ODbL). The terms of the ODbL apply to this data; these terms do not restrict the rights granted there.',
      ],
    },
    {
      h: '7. Your content',
      list: [
        'Tours, texts and ratings you create remain yours.',
        'When you publish a tour in the community, you allow us free of charge to display it in Cumo Drive, make it available to other users and use it to improve route planning. Display ends when you withdraw or delete the tour.',
        'We evaluate ratings and driven tracks in aggregated form and without reference to you as a person to rate roads. The evaluation becomes part of our database.',
        'Only publish what you are allowed to: no third party content without rights, no offensive or unlawful content, no routes that encourage prohibited behaviour. We may remove such content.',
      ],
    },
    {
      h: '7a. Messages, reporting and blocking',
      list: [
        'Messages, chats and the radio are meant for drives and exchange between drivers. Prohibited are unlawful content and deals of any kind (for example drugs, weapons or stolen goods), advertising and spam, fraud and harassment.',
        'You can report any content and any profile and block other drivers. We review reported content; for this we store a copy of the reported content with each report.',
        'If content violates these terms or the law, we remove it or suspend the account. You then receive a notice with reasons in the app and can object at ' + CONTACT + '.',
        'New accounts can only message others after 24 hours, unless they drive together. New conversations are limited per day.',
        'We only disclose data to authorities upon formal request. If there are indications of a danger to the life or safety of people, we inform the competent authorities.',
      ],
    },
    {
      h: '8. Liability',
      p: [
        'We are liable without limitation for intent and gross negligence, for damage from injury to life, body or health and under the Product Liability Act. In case of slight negligence we are only liable for breach of essential contractual obligations and limited to the typical, foreseeable damage. Otherwise liability is excluded.',
        'We give no warranty for the content and availability of third party services (maps, weather, pass status, place search).',
      ],
    },
    {
      h: '9. Changes to these terms',
      p: [
        'We may change these terms when laws, features or services change. Changes that only concern new features, do not put you in a worse position or are legally required apply once the new version is published. We inform you about significant changes in advance in the app or by email; they only apply to you once you agree to them. If you do not agree, you can keep using the app under the previous terms until the end of a paid period and delete your account at any time.',
      ],
    },
    {
      h: '10. Final provisions',
      list: [
        'German law applies. If you are a consumer with habitual residence in another country, the mandatory consumer protection rules of that country remain unaffected.',
        'We do not participate in dispute resolution proceedings before a consumer arbitration board and are not obliged to do so.',
        'If a provision is invalid, the remaining provisions remain valid.',
        'In case of doubt, the German version of these terms prevails.',
      ],
    },
  ],
};

export const IMPRINT_EN: LegalDoc = {
  title: 'Legal notice',
  lead: 'Information according to § 5 DDG (German Digital Services Act) for the Cumo Drive app, the web planner and the website cumodrive.de.',
  stand: STAND,
  blocks: [
    { h: 'Provider', p: ['CUMO DRIVERS CLUB', 'represented by Koray Önal', 'Ludwigstraße 62b', '64646 Heppenheim', 'Germany'] },
    { h: 'Contact', p: [`Email: ${CONTACT}`, 'In the app you can also reach us under Settings, Feedback. We usually reply within two working days.'] },
    { h: 'Responsible for content', p: ['Responsible according to § 18 (2) MStV: Koray Önal, address as above.'] },
    { h: 'Consumer dispute resolution', p: ['We do not take part in dispute resolution proceedings before a consumer arbitration board and are not obliged to do so.'] },
    {
      h: 'Content and data',
      p: [
        'Map data comes in part from OpenStreetMap (© OpenStreetMap contributors, ODbL licence). The road and pass database, texts, ratings and the Cumo Drive logo are protected by copyright.',
        'The operators of external sites we link to are responsible for their content.',
      ],
    },
  ],
};
