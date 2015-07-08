/*
 * Constants for various SAME message fields, as defined in 47 CFR 11.
 * Refs:
 * [47CFR11] http://www.gpo.gov/fdsys/pkg/CFR-2010-title47-vol1/pdf/CFR-2010-title47-vol1-part11.pdf
 * [ISO3166-2:US] https://www.iso.org/obp/ui/#iso:code:3166:US
 * [CENSUS] https://www.census.gov/geo/reference/codes/cou.html
 * [COUNTY] http://www2.census.gov/geo/docs/reference/codes/files/national_county.txt
 */
try {
  module.exports = {
    // Originator codes: [47CFR11] §11.31(d)
    // "...indicates who originally initiated the activation of the EAS."
    originator: {
      'EAS': 'Emergency Alert System participant',
      'CIV': 'Civil authorities',
      'WXR': 'National Weather Service',
      'PEP': 'Primary Entry Point System' // ([47CFR11] §11.14)
    },
    
    // Event type codes: [47CFR11] §11.31(e)
    // "...indicates the nature of the EAS activation."
    code: {
      'EAN': 'Emergency Action Notification',
      'EAT': 'Emergency Action Termination',
      'NIC': 'National Information Center',
      'NPT': 'National Periodic Test',
      'RMT': 'Required Monthly Test',
      'RWT': 'Required Weekly Test',
      'ADR': 'Administrative Message',
      'AVW': 'Avalanche Warning',
      'AVA': 'Avalanche Watch',
      'BZW': 'Blizzard Warning',
      'CAE': 'Child Abduction Emergency',
      'CDW': 'Civil Danger Warning',
      'CEM': 'Civil Emergency Message',
      'CFW': 'Coastal Flood Warning',
      'CFA': 'Coastal Flood Watch',
      'DSW': 'Dust Storm Warning',
      'EQW': 'Earthquake Warning',
      'EVI': 'Evacuation Immediate',
      'FRW': 'Fire Warning',
      'FFW': 'Flash Flood Warning',
      'FFA': 'Flash Flood Watch',
      'FFS': 'Flash Flood Statement',
      'FLW': 'Flood Warning',
      'FLA': 'Flood Watch',
      'FLS': 'Flood Statement',
      'HMW': 'Hazardous Materials Warning',
      'HWW': 'High Wind Warning',
      'HWA': 'High Wind Watch',
      'HUW': 'Hurricane Warning',
      'HUA': 'Hurricane Watch',
      'HLS': 'Hurricane Statement',
      'LEW': 'Law Enforcement Warning',
      'LAE': 'Local Area Emergency',
      'NMN': 'Network Message Notification',
      'TOE': '911 Telephone Outage Emergency',
      'NUW': 'Nuclear Power Plant Warning',
      'DMO': 'Practice/Demo Warning',
      'RHW': 'Radiological Hazard Warning',
      'SVR': 'Severe Thunderstorm Warning',
      'SVA': 'Severe Thunderstorm Watch',
      'SVS': 'Severe Weather Statement',
      'SPW': 'Shelter in Place Warning',
      'SMW': 'Special Marine Warning',
      'SPS': 'Special Weather Statement',
      'TOR': 'Tornado Warning',
      'TOA': 'Tornado Watch',
      'TRW': 'Tropical Storm Warning',
      'TRA': 'Tropical Storm Watch',
      'TSW': 'Tsunami Warning',
      'TSA': 'Tsunami Watch',
      'VOW': 'Volcano Warning',
      'WSW': 'Winter Storm Warning',
      'WSA': 'Winter Storm Watch'
    },

    // Region codes
    
    // [47CFR11] §11.31(f); retrieved from [COUNTY].
    stateCode: require('./state.json'),

    // FIXME merge in the following "state" codes, not present in [COUNTY]:
    //   '57': 'Eastern North Pacific Ocean, and along U.S.  West Coast from Canadian border to Mexican border',
    //   '58': 'North Pacific Ocean near Alaska, and along Alas- ka coastline, including the Bering Sea and the Gulf of Alaska',
    //   '61': 'Central Pacific Ocean, including Hawaiian waters 59 South Central Pacific Ocean, including American Samoa waters',
    //   '65': 'Western Pacific Ocean, including Mariana Island waters',
    //   '73': 'Western North Atlantic Ocean, and along U.S.  East Coast, from Canadian border south to Currituck Beach Light, N.C',
    //   '75': 'Western North Atlantic Ocean, and along U.S.  East Coast, south of Currituck Beach Light, N.C., following the coastline into Gulf of Mexico to Bonita Beach, FL., including the Caribbean',
    //   '77': 'Gulf of Mexico, and along the U.S. Gulf Coast from the Mexican border to Bonita Beach, FL',
    //   '91': 'Lake Superior',
    //   '92': 'Lake Michigan',
    //   '93': 'Lake Huron',
    //   '94': 'Lake St. Clair',
    //   '96': 'Lake Erie',
    //   '97': 'Lake Ontario',
    //   '98': 'St. Lawrence River above St. Regis'

    // Included in [47CFR11] §11.31(f) by reference to "State EAS
    // Mapbook"; the following are retrieved from [COUNTY], and class
    // codes discarded.
    countyCode: require('./county.json'),

    // For non-national events, the subdivision of the specified region,
    // as defined in [47CFR11] §11.31(c).
    subdiv: [0,       // entire region
             1, 2, 3, // NW, N,  NE
             4, 5, 6, // W,  Ct, E
             7, 8, 9] // SW, S,  SE
  };
} catch (e) {
  throw new Error('Unable to load SAME fixtures: ' + e.message);
}
