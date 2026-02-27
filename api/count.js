// /api/count.js
module.exports = async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
    try {
      const response = await fetch(
        'https://script.google.com/macros/s/AKfycbwnBoqKS1g6goc1CciecdPwU6g2nTrHu6DUn3DvvcbPCTLgBBWwcbTK4jRkpvNTZoT33w/exec'
      );
      const data = await response.json();
      return res.status(200).json({ count: data.count || 0 });
    } catch (err) {
      console.error('Count fetch error:', err);
      return res.status(200).json({ count: 0 });
    }
  };

