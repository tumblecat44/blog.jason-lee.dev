const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
    const host = req.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
        return res.status(403).json({ error: 'Access denied. Admin panel is only accessible from localhost.' });
    }
    next();
});

app.use(cors({ origin: ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:3000'] }));
app.use(express.json());
app.use(express.static('.'));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(__dirname, 'images');
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

async function gitCommitAndPush(action, postTitle) {
    try {
        // Git add
        await execAsync('git add posts/');
        
        // Git commit
        const commitMessage = `${action}: ${postTitle}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
        
        await execAsync(`git commit -m "${commitMessage}"`);
        
        // Git push (optional - only if remote exists)
        try {
            await execAsync('git push');
            console.log('✅ Git push successful');
        } catch (pushError) {
            console.log('⚠️  Git push failed (no remote or connection issue):', pushError.message);
        }
        
        console.log('✅ Git commit successful:', action, postTitle);
    } catch (error) {
        console.log('⚠️  Git commit failed:', error.message);
    }
}

app.get('/api/posts', async (req, res) => {
    try {
        const postsPath = path.join(__dirname, 'posts', 'posts.json');
        const data = await fs.readFile(postsPath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read posts' });
    }
});

app.get('/api/posts/:filename', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'posts', req.params.filename);
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (error) {
        res.status(404).json({ error: 'Post not found' });
    }
});

app.post('/api/posts', async (req, res) => {
    try {
        const { title, content, date } = req.body;
        const postDate = date || new Date().toISOString().split('T')[0];
        const slug = slugify(title);
        const filename = `${postDate}-${slug}.md`;
        
        const frontMatter = `---
title: "${title}"
date: "${postDate}"
---

${content}`;

        const filePath = path.join(__dirname, 'posts', filename);
        await fs.writeFile(filePath, frontMatter);

        const postsPath = path.join(__dirname, 'posts', 'posts.json');
        const postsData = await fs.readFile(postsPath, 'utf-8');
        const posts = JSON.parse(postsData);
        
        posts.posts.unshift({
            filename,
            title,
            date: postDate
        });

        await fs.writeFile(postsPath, JSON.stringify(posts, null, 2));
        
        // Git auto-commit
        await gitCommitAndPush('Add post', title);
        
        res.json({ success: true, filename });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create post: ' + error.message });
    }
});

app.put('/api/posts/:filename', async (req, res) => {
    try {
        const { title, content, date } = req.body;
        const { filename: oldFilename } = req.params;
        
        const frontMatter = `---
title: "${title}"
date: "${date}"
---

${content}`;

        const filePath = path.join(__dirname, 'posts', oldFilename);
        await fs.writeFile(filePath, frontMatter);

        const postsPath = path.join(__dirname, 'posts', 'posts.json');
        const postsData = await fs.readFile(postsPath, 'utf-8');
        const posts = JSON.parse(postsData);
        
        const postIndex = posts.posts.findIndex(p => p.filename === oldFilename);
        if (postIndex !== -1) {
            posts.posts[postIndex] = {
                filename: oldFilename,
                title,
                date
            };
            await fs.writeFile(postsPath, JSON.stringify(posts, null, 2));
        }
        
        // Git auto-commit
        await gitCommitAndPush('Update post', title);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update post: ' + error.message });
    }
});

app.delete('/api/posts/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        const filePath = path.join(__dirname, 'posts', filename);
        await fs.unlink(filePath);

        const postsPath = path.join(__dirname, 'posts', 'posts.json');
        const postsData = await fs.readFile(postsPath, 'utf-8');
        const posts = JSON.parse(postsData);
        
        const deletedPost = posts.posts.find(p => p.filename === filename);
        posts.posts = posts.posts.filter(p => p.filename !== filename);
        await fs.writeFile(postsPath, JSON.stringify(posts, null, 2));
        
        // Git auto-commit
        await gitCommitAndPush('Delete post', deletedPost?.title || filename);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete post: ' + error.message });
    }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ url: `/images/${req.file.filename}` });
});

app.listen(PORT, 'localhost', () => {
    console.log(`\n✨ Blog Admin Server is running!`);
    console.log(`\n📝 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🌐 Blog: http://localhost:8000`);
    console.log(`\n⚠️  This server is only accessible from localhost for security.`);
    
    // 자동으로 브라우저에서 admin 페이지 열기
    const { exec } = require('child_process');
    const platform = process.platform;
    const url = `http://localhost:${PORT}/admin`;
    
    let command;
    if (platform === 'darwin') {
        command = `open ${url}`;
    } else if (platform === 'win32') {
        command = `start ${url}`;
    } else {
        command = `xdg-open ${url}`;
    }
    
    exec(command, (error) => {
        if (error) {
            console.log('\n💡 Please open your browser and navigate to:', url);
        }
    });
});