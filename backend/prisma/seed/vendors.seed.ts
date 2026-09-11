import { PrismaClient } from '@prisma/client';

const vendorBlueprints = {
  software: [
    'Microsoft', 'Google Workspace', 'Adobe', 'Oracle', 'Salesforce', 'ServiceNow', 'Atlassian', 'Slack', 'Zoom', 'Dropbox',
    'Okta', 'Notion', 'HubSpot', 'SAP', 'Shopify', 'Autodesk', 'Stripe', 'GitHub', 'Box', 'Figma', 'Twilio', 'Asana',
    'Google Cloud', 'AWS', 'Datadog', 'Snowflake', 'Tableau', 'Jira', 'Confluence', 'Canva', 'MongoDB', 'SendGrid',
    'Qualtrics', 'Freshdesk', 'Intercom', 'Miro', 'Monday.com', 'Linear', 'Mailchimp', 'SurveyMonkey', 'Typeform',
    'Trello', 'Lucidchart', 'Sentry', 'PagerDuty', 'New Relic', 'Proofpoint', 'Vercel', 'Netlify', 'Cloudflare', 'OpenAI',
    'Anthropic', 'GitLab', 'Postman', 'Zapier', 'Kajabi', 'Webflow', 'Basecamp', '1Password', 'Bitwarden', 'AirTable',
    'Workday', 'Zendesk', 'DocuSign', 'LastPass', 'Airtable', 'FreshBooks', 'ClickUp'
  ],
  hardware: [
    'Dell Technologies', 'Lenovo', 'HP Inc.', 'Apple', 'Cisco', 'Juniper Networks', 'Aruba Networks', 'Samsung', 'Acer',
    'Brother', 'Epson', 'Ricoh', 'Dell Financial', 'Canon', 'Logitech', 'Poly', 'Netgear', 'Synology', 'Ubiquiti',
    'Western Digital', 'Seagate', 'Kingston', 'Crucial', 'NVIDIA', 'AMD', 'Intel', 'TP-Link', 'Trendnet', 'JetBrains Hardware',
    'Dell Managed Services', 'Lenovo Enterprise', 'Google Pixel', 'Microsoft Surface', 'CompuCom', 'CDW', 'Ingram Micro',
    'IT Hardware Group', 'Palo Alto Networks', 'Fortinet', 'Kaspersky', 'Trend Micro', 'Veeam', 'SonicWall', 'Mitel', 'Cisco Meraki'
  ],
  services: [
    'Northwind Consulting', 'Catalyst Advisory', 'Harbor Systems', 'BluePeak Strategy', 'Crownpoint Digital', 'Lattice Analytics',
    'Summit Systems Integrators', 'Aster Consulting', 'Fourth Quarter Partners', 'Bayside Advisory', 'Keystone Delivery',
    'Meridian Growth Studio', 'Cedar Labs', 'Stonebridge Solutions', 'Oak & Ash Services', 'Harbor Data Group', 'Nexus Advisory',
    'Redline Operations', 'Vertex Services', 'SignalWorks', 'Luma Integration', 'Bridgepoint Consulting', 'Bluebird Ops',
    'Evergreen Creative', 'Frostline Research', 'Maple Grove Advisory', 'Nora & Co.', 'Eastline Delivery', 'Northstar Labs',
    'Goldcrest Services', 'Pioneer Consulting', 'Apex Advisory', 'Harborfield Partners', 'Cobalt Systems', 'Summit Foundry',
    'Riverside Analytics', 'Brightfield Services', 'Signal River', 'Greenstone Consulting', 'Ironwood Strategy', 'Pinecrest Ops',
    'Mason Lane Group', 'Atlas Support', 'Pearl Harbor Consulting', 'Blue Harbor Transformation', 'Pilot Creek Advisory',
    'Horizon Systems', 'Mariner Services', 'Vantage Operations', 'Hearthstone Consulting', 'Copperline Advisors', 'Mapleworks Studio'
  ],
  facilities: [
    'Hillside Properties', 'Oak Street Offices', 'Evergreen Real Estate', 'Cedar Point Management', 'Granite Tower Group',
    'Lakeview Facilities', 'Southfield Commercial', 'Harborview Realty', 'Blue Ridge Holdings', 'Pinecrest Campus',
    'Bridgewater Property', 'Bayside Workspace', 'Terra Nova Leasing', 'Summit Tower Management', 'Maple Ridge Properties',
    'Northside Facilities', 'Beacon Office Group', 'Lakeshore Management', 'Parkline Realty', 'Crescent Heights', 'Elmwood Workspaces',
    'Willow Creek Properties', 'Beacon Commercial', 'Highpoint Facilities', 'Hawthorn Property Group'
  ],
  travel: [
    'Delta Air Lines', 'American Airlines', 'United Airlines', 'Southwest', 'JetBlue', 'Air France', 'British Airways',
    'Emirates', 'Turkish Airlines', 'Qatar Airways', 'United Business Travel', 'Expedia for Business', 'Booking.com Business',
    'American Express GBT', 'TravelPerk', 'Hopper', 'HotelTonight', 'Marriott Business', 'Hilton Business', 'Avis Budget',
    'Enterprise Travel', 'Uber Business', 'Lyft Business', 'Trainline Business'
  ]
} as const;

const categoryCounts = {
  software: 60,
  hardware: 45,
  services: 55,
  facilities: 25,
  travel: 15,
} as const;

export async function seedVendors(prisma: PrismaClient): Promise<void> {
  const vendors = Object.entries(vendorBlueprints).flatMap(([category, names]) => {
    const categoryList = names as readonly string[];
    const targetCount = categoryCounts[category as keyof typeof categoryCounts];

    return Array.from({ length: targetCount }, (_, index) => {
      const name = categoryList[index % categoryList.length];
      const suffix = targetCount > categoryList.length && index >= categoryList.length ? ` ${index + 1}` : '';
      const fullName = `${name}${suffix}`;
      return {
        name: fullName,
        normalizedName: fullName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
        category,
      };
    });
  });

  await prisma.vendor.createMany({ data: vendors });
}
