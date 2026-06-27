import jwt from 'jsonwebtoken';

export default function (req, res, next) {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Access Denied. No token provided.' });

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};
