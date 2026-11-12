# Narrin Farms website

Three-page static site for Narrin Farms (1100 Bird Rd, Ortonville, MI 48462):

- `index.html` — home: hero, story, scroll-driven 3D farm tour, gallery, seasons, interactive map
- `stay.html` — Stay & Board: the four homes, comparison, horse boarding, amenities
- `contact.html` — Visit & Contact: contact details, inquiry form, map and directions, FAQ

No build step. Open `index.html`, or serve the folder with any static host.

## Hosting on GitHub Pages

In the repository's **Settings → Pages**, choose **Deploy from a branch**, then select the branch
that holds this site and the `/ (root)` folder. The site appears at
`https://<owner>.github.io/<repo>/`. A custom domain such as `narrinfarms.com` can be added on the same page.

## Editing

- Text and photos live in the three HTML files and `assets/img/`.
- The 3D tour (`assets/js/farm3d.js`) is built from `assets/js/farm-layout.js` and
  `assets/img/farm-ground.jpg`, both traced from aerial imagery of the farm.
- The map (`assets/js/map.js`) uses Esri satellite tiles, with the traced farm plan as a fallback.
- The inquiry form prepares an email to service@narrinfarms.com; there is no server.
